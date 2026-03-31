import { getModel, completeSimple, type Context } from '@mariozechner/pi-ai';
import prisma from './prisma.js';

// Config cache with TTL
let cachedConfig: {
  id: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  context?: string;
  maxTokens: number;
} | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Available themes for categorization
const THEMES = [
  { slug: 'technology', name: 'Technology', description: 'computers, software, digital tech, internet' },
  { slug: 'business', name: 'Business', description: 'professional, corporate, finance, work' },
  { slug: 'environment', name: 'Environment', description: 'nature, ecology, sustainability, climate' },
  { slug: 'health', name: 'Health & Medicine', description: 'medical, health, wellness, disease' },
  { slug: 'science', name: 'Science', description: 'scientific, research, physics, chemistry, biology' },
  { slug: 'education', name: 'Education', description: 'academic, learning, school, teaching' },
  { slug: 'food', name: 'Food & Cooking', description: 'culinary, cooking, nutrition, dining' },
  { slug: 'society', name: 'Society & Culture', description: 'social, cultural, politics, community' },
  { slug: 'general', name: 'General', description: 'general vocabulary not specific to any topic' },
];

const themeSlugs = THEMES.map(t => t.slug);

const BATCH_SYSTEM_PROMPT = `You are a word categorization assistant. Your task is to categorize English vocabulary words into categories.

Available categories:
${THEMES.map(t => `- ${t.slug}: ${t.name} (${t.description})`).join('\n')}
- general: for words that don't fit any specific category

Rules:
1. Return a valid JSON object where keys are words and values are category slugs
2. If a word doesn't clearly fit any category, use "general"
3. Be consistent - similar words should get the same category
4. Consider the word's primary/most common meaning
5. Return ONLY the JSON object, no explanation`;

/**
 * Get active LLM config from database (with 5-min TTL cache)
 */
export async function getLLMConfig(): Promise<{
  id: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  context?: string;
  maxTokens: number;
}> {
  // Return cached config if still fresh
  if (cachedConfig && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    return cachedConfig;
  }

  try {
    // Get active provider from new LlmProvider table
    const activeProvider = await prisma.llmProvider.findFirst({
      where: { isActive: true },
    });

    if (activeProvider) {
      cachedConfig = {
        id: activeProvider.id,
        provider: activeProvider.provider,
        model: activeProvider.model,
        apiKey: activeProvider.apiKey || undefined,
        baseUrl: activeProvider.baseUrl || undefined,
        context: activeProvider.context || undefined,
        maxTokens: activeProvider.maxTokens,
      };
      configCacheTime = Date.now();
      return cachedConfig;
    }

    // Fallback to legacy SystemConfig (for backwards compatibility)
    const configs = await prisma.systemConfig.findMany({
      where: {
        key: { in: ['llm.provider', 'llm.model', 'llm.api_key', 'llm.base_url', 'llm.context'] }
      }
    });

    const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

    if (Object.keys(configMap).length > 0) {
      cachedConfig = {
        id: 'legacy',
        provider: configMap['llm.provider'] || 'openai',
        model: configMap['llm.model'] || 'gpt-4o-mini',
        apiKey: configMap['llm.api_key'] || undefined,
        baseUrl: configMap['llm.base_url'] || undefined,
        context: configMap['llm.context'] || undefined,
        maxTokens: 4096,
      };
      configCacheTime = Date.now();
      return cachedConfig;
    }

    // Final fallback to env vars
    cachedConfig = {
      id: 'env',
      provider: process.env.LLM_PROVIDER || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      context: process.env.LLM_CONTEXT,
      maxTokens: 4096,
    };
    configCacheTime = Date.now();
    return cachedConfig;
  } catch (error) {
    // Fallback to env vars if database fails
    return {
      id: 'env',
      provider: process.env.LLM_PROVIDER || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      context: process.env.LLM_CONTEXT,
      maxTokens: 4096,
    };
  }
}

/**
 * Clear config cache (call when config changes)
 */
export function clearLLMConfigCache() {
  cachedConfig = null;
  configCacheTime = 0;
}

/**
 * Call LLM API - always use pi-ai for proper thinking/reasoning handling
 */
async function callLLM(
  systemPrompt: string, 
  userPrompt: string, 
  config: Awaited<ReturnType<typeof getLLMConfig>>,
  options?: { disableReasoning?: boolean }
): Promise<string> {
  const piAiProviders = ['openai', 'anthropic', 'google', 'groq', 'openrouter', 'mistral', 'cerebras', 'xai'];
  
  // Try pi-ai's predefined models first
  if (piAiProviders.includes(config.provider.toLowerCase())) {
    const model = getModel(config.provider.toLowerCase() as any, config.model as any);
    
    if (model) {
      const context: Context = {
        systemPrompt,
        messages: [
          { role: 'user', content: userPrompt, timestamp: Date.now() }
        ]
      };
      
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
      console.log(`[LLM] Known provider: ${config.provider}, model: ${config.model}`);
      const response = await completeSimple(model, context, { apiKey });
      
      console.log(`[LLM] Response stopReason: ${response.stopReason}, content types: [${response.content.map(c => c.type).join(', ')}]`);
      
      return response.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join('')
        .trim();
    }
    
    // Model not in pi-ai registry, fall through to custom model below
  }
  
  // For custom/unknown providers OR known provider with unknown model (e.g. deepseek-reasoner)
  // Create a pi-ai custom Model for proper thinking/reasoning separation
  let baseUrl = config.baseUrl;
  // Ensure baseUrl ends with /v1 for OpenAI-compatible APIs
  if (baseUrl && !baseUrl.endsWith('/v1') && !baseUrl.endsWith('/v1/')) {
    baseUrl = baseUrl.replace(/\/$/, '') + '/v1';
  }
  
  const customModel = {
    id: config.model,
    name: `${config.provider}/${config.model}`,
    api: 'openai-completions' as const,
    provider: config.provider.toLowerCase(),
    ...(baseUrl ? { baseUrl } : {}),
    reasoning: options?.disableReasoning ? false : true,
    input: ['text'] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: config.maxTokens,
    compat: {
      supportsDeveloperRole: false,  // DeepSeek and others use 'system', not 'developer'
      supportsStore: false,
      supportsReasoningEffort: false,
      maxTokensField: 'max_tokens' as const,
    },
  };
  
  const context: Context = {
    systemPrompt,
    messages: [
      { role: 'user', content: userPrompt, timestamp: Date.now() }
    ]
  };
  
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  
  try {
    console.log(`[LLM] Calling provider: ${config.provider}, model: ${config.model}, baseUrl: ${config.baseUrl || 'default'}`);
    
    const response = await completeSimple(customModel as any, context, {
      apiKey,
      ...(options?.disableReasoning ? {} : { reasoning: 'medium' }),
    });
    
    console.log(`[LLM] Response stopReason: ${response.stopReason}, errorMessage: ${response.errorMessage}`);
    console.log(`[LLM] Response content types: [${response.content.map(c => c.type).join(', ')}]`);
    
    if (response.stopReason === 'error') {
      console.error('[LLM] Error response:', response.errorMessage);
      console.error('[LLM] Content:', JSON.stringify(response.content).slice(0, 500));
    }
    
    const textContent = response.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim();
    
    if (!textContent) {
      // Log full content for debugging
      console.error(`[LLM] Empty text response. Full content:`, JSON.stringify(response.content).slice(0, 1000));
      console.error(`[LLM] Stop reason: ${response.stopReason}`);
      
      // Fallback: try to extract text from thinking blocks (reasoning models may only produce thinking)
      const thinkingContent = response.content
        .filter((c): c is { type: 'thinking'; thinking: string } => c.type === 'thinking')
        .map(c => c.thinking)
        .join('\n')
        .trim();
      
      if (thinkingContent) {
        console.log(`[LLM] Found thinking content (${thinkingContent.length} chars) but skipReason=length, model ran out of tokens before producing output`);
      }
    } else {
      console.log(`[LLM] Got text response (${textContent.length} chars): ${textContent.slice(0, 200)}`);
    }
    
    return textContent;
  } catch (error: any) {
    console.error('LLM call failed:', error.message);
    throw error;
  }
}

/**
 * Categorize a single word using LLM
 */
export async function categorizeWord(
  word: string,
  definition?: string,
  partOfSpeech?: string[]
): Promise<string> {
  try {
    console.log(`[categorizeWord] Categorizing: "${word}"`);
    const config = await getLLMConfig();
    
    let prompt = `Categorize this English word into ONE of these categories: ${themeSlugs.join(', ')}.\n\nWord: "${word}"`;
    if (partOfSpeech?.length) {
      prompt += `\nPart of speech: ${partOfSpeech.join(', ')}`;
    }
    if (definition) {
      prompt += `\nDefinition: ${definition.slice(0, 500)}`;
    }
    prompt += `\n\nRespond with ONLY the category slug. No thinking, no explanation, just one word.`;
    
    const systemPrompt = 'You are a word categorization assistant. Respond with ONLY a single category slug. Be concise.';
    const responseText = await callLLM(systemPrompt, prompt, config, { disableReasoning: true });
    
    return extractCategory(responseText.toLowerCase());
    
  } catch (error) {
    console.error(`Failed to categorize "${word}":`, error);
    return 'general';
  }
}

/**
 * Batch categorize multiple words in a SINGLE LLM request
 */
export async function categorizeWordsBatch(
  words: Array<{ word: string; definition?: string; partOfSpeech?: string[] }>,
  options?: { onProgress?: (done: number, total: number) => void }
): Promise<Array<{ word: string; category: string }>> {
  if (words.length === 0) return [];
  
  try {
    const config = await getLLMConfig();
    
    const wordsList = words.map((w, i) => {
      let entry = `${i + 1}. "${w.word}"`;
      if (w.partOfSpeech?.length) {
        entry += ` (${w.partOfSpeech.join(', ')})`;
      }
      if (w.definition) {
        const def = w.definition.length > 100 ? w.definition.slice(0, 100) + '...' : w.definition;
        entry += `: ${def}`;
      }
      return entry;
    }).join('\n');
    
    const prompt = `Categorize the following ${words.length} English words into categories.

Words:
${wordsList}

IMPORTANT: Return ONLY a valid JSON object. No explanation, no markdown, no code blocks.
Format: {"word": "category", ...}

Example: {"abandon": "general", "algorithm": "technology", "bake": "food"}

JSON:`;

    const responseText = await callLLM(BATCH_SYSTEM_PROMPT, prompt, config, { disableReasoning: true });
    
    const categories = parseCategoriesJson(responseText, words.map(w => w.word));
    
    if (options?.onProgress) {
      options.onProgress(words.length, words.length);
    }
    
    return words.map(w => ({
      word: w.word,
      category: categories[w.word.toLowerCase()] || 'general',
    }));
    
  } catch (error) {
    console.error('Batch categorization failed:', error);
    return words.map(w => ({ word: w.word, category: 'general' }));
  }
}

/**
 * Parse JSON response from LLM - handles common LLM output quirks
 */
function parseCategoriesJson(text: string, _expectedWords: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  
  // Extract JSON from markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = codeBlockMatch ? codeBlockMatch[1] : text;
  
  // Find JSON object in the text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('No JSON object found in LLM response');
    return result;
  }
  
  let jsonStr = jsonMatch[0];
  
  // Fix common LLM JSON issues: trailing commas, single quotes, unquoted keys/values, JS comments
  jsonStr = jsonStr
    .replace(/,\s*([}\]])/g, '$1')                          // trailing commas
    .replace(/'/g, '"')                                      // single → double quotes
    .replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3')  // unquoted keys
    .replace(/:\s*([a-zA-Z_]\w*)(\s*[,}])/g, ':"$1"$2')     // unquoted values
    .replace(/\/\/.*$/gm, '')                                // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');                       // multi-line comments
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    for (const [word, category] of Object.entries(parsed)) {
      const w = word.toLowerCase().trim().replace(/^["']|["']$/g, '');
      const c = String(category).toLowerCase().trim().replace(/^["']|["']$/g, '');
      result[w] = themeSlugs.includes(c) ? c : extractCategory(c);
    }
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    console.error('Attempted:', jsonStr.slice(0, 300));
  }
  
  return result;
}

function extractCategory(text: string): string {
  const cleaned = text.replace(/[^a-z]/g, '').trim();
  
  if (themeSlugs.includes(cleaned)) {
    return cleaned;
  }
  
  for (const cat of themeSlugs) {
    if (cleaned.includes(cat) || cat.includes(cleaned)) {
      return cat;
    }
  }
  
  const categoryHints: Record<string, string[]> = {
    technology: ['tech', 'computer', 'software', 'digital', 'internet', 'web'],
    business: ['business', 'work', 'corporate', 'finance', 'office', 'professional'],
    environment: ['environment', 'nature', 'eco', 'green', 'climate'],
    health: ['health', 'medical', 'medicine', 'doctor', 'disease', 'wellness'],
    science: ['science', 'scientific', 'research', 'physics', 'chemistry', 'biology'],
    education: ['education', 'school', 'learning', 'academic', 'teaching', 'student'],
    food: ['food', 'cooking', 'culinary', 'kitchen', 'eat', 'meal'],
    society: ['society', 'social', 'culture', 'cultural', 'community', 'people'],
  };
  
  for (const [cat, hints] of Object.entries(categoryHints)) {
    if (hints.some(hint => text.includes(hint))) {
      return cat;
    }
  }
  
  return 'general';
}

/**
 * Batch categorize with progress callback
 */
export async function categorizeWords(
  words: Array<{ word: string; definition?: string; partOfSpeech?: string[] }>,
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void }
): Promise<Array<{ word: string; category: string }>> {
  return categorizeWordsBatch(words, options);
}

/**
 * Check if LLM service is available (config check only, no API call)
 */
export async function checkLLMAvailability(): Promise<{ 
  available: boolean; 
  provider?: string;
  model?: string; 
  error?: string 
}> {
  try {
    const config = await getLLMConfig();
    
    if (!config.apiKey && !process.env.OPENAI_API_KEY) {
      return { 
        available: false, 
        provider: config.provider, 
        model: config.model,
        error: 'No API key configured' 
      };
    }
    
    return { available: true, provider: config.provider, model: config.model };
  } catch (error: any) {
    return { 
      available: false, 
      error: error.message || 'Failed to load configuration' 
    };
  }
}

/**
 * Test a specific provider configuration
 */
export async function testProviderConfig(config: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const piAiProviders = ['openai', 'anthropic', 'google', 'groq', 'openrouter', 'mistral', 'cerebras', 'xai'];
    
    const context: Context = {
      systemPrompt: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'Say "ok"', timestamp: Date.now() }]
    };

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    let response;

    if (piAiProviders.includes(config.provider.toLowerCase())) {
      const model = getModel(config.provider.toLowerCase() as any, config.model as any);
      
      if (model) {
        response = await completeSimple(model, context, { apiKey });
      }
    }

    // Custom provider or known provider with unknown model
    if (!response) {
      let baseUrl = config.baseUrl;
      if (baseUrl && !baseUrl.endsWith('/v1') && !baseUrl.endsWith('/v1/')) {
        baseUrl = baseUrl.replace(/\/$/, '') + '/v1';
      }
      
      const customModel = {
        id: config.model,
        name: `${config.provider}/${config.model}`,
        api: 'openai-completions' as const,
        provider: config.provider.toLowerCase(),
        ...(baseUrl ? { baseUrl } : {}),
        reasoning: false,
        input: ['text'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 500,
        compat: {
          supportsDeveloperRole: false,
          supportsStore: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens' as const,
        },
      };
      
      response = await completeSimple(customModel as any, context, { apiKey });
    }

    // Check response for errors
    if (!response) {
      return { success: false, error: 'No response from model' };
    }

    if (response.stopReason === 'error') {
      return { success: false, error: response.errorMessage || 'LLM returned an error' };
    }

    // Verify we got actual text content back
    const text = response.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim();

    if (!text) {
      return { success: false, error: 'LLM returned empty response' };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
}

export { THEMES };
