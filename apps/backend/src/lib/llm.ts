import { getModel, completeSimple, type Context } from '@mariozechner/pi-ai';
import prisma from './prisma.js';

// Config cache
let cachedConfig: {
  id: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  context?: string;
} | null = null;

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
 * Get active LLM config from database
 */
export async function getLLMConfig(): Promise<{
  id: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  context?: string;
}> {
  if (cachedConfig) return cachedConfig;

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
      };
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
      };
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
    };
    
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
    };
  }
}

/**
 * Clear config cache (call when config changes)
 */
export function clearLLMConfigCache() {
  cachedConfig = null;
}

/**
 * Call LLM API - always use pi-ai for proper thinking/reasoning handling
 */
async function callLLM(
  systemPrompt: string, 
  userPrompt: string, 
  config: Awaited<ReturnType<typeof getLLMConfig>>
): Promise<string> {
  const piAiProviders = ['openai', 'anthropic', 'google', 'groq', 'openrouter', 'mistral', 'cerebras', 'xai'];
  
  // Try pi-ai's predefined models first
  if (piAiProviders.includes(config.provider.toLowerCase())) {
    if (config.apiKey) {
      const envKey = config.provider.toLowerCase() === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      process.env[envKey] = config.apiKey;
    }
    
    const model = getModel(config.provider.toLowerCase() as any, config.model as any);
    
    if (model) {
      const context: Context = {
        systemPrompt,
        messages: [
          { role: 'user', content: userPrompt, timestamp: Date.now() }
        ]
      };
      
      const response = await completeSimple(model, context);
      
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
    reasoning: true,
    input: ['text'] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
  
  const context: Context = {
    systemPrompt,
    messages: [
      { role: 'user', content: userPrompt, timestamp: Date.now() }
    ]
  };
  
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  
  try {
    const response = await completeSimple(customModel as any, context, {
      apiKey,
      reasoning: 'medium',
    });
    
    const textContent = response.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim();
    
    if (!textContent) {
      const contentTypes = response.content.map(c => c.type).join(', ');
      console.error(`LLM returned empty text. Content types: [${contentTypes}]`);
      if (response.stopReason) {
        console.error(`Stop reason: ${response.stopReason}`);
      }
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
    const config = await getLLMConfig();
    
    let prompt = `Categorize this English word:\n\nWord: "${word}"`;
    if (partOfSpeech?.length) {
      prompt += `\nPart of speech: ${partOfSpeech.join(', ')}`;
    }
    if (definition) {
      prompt += `\nDefinition: ${definition.slice(0, 500)}`;
    }
    prompt += `\n\nReturn ONLY the category slug (one of: ${themeSlugs.join(', ')}). No explanation.`;
    
    const systemPrompt = BATCH_SYSTEM_PROMPT;
    const responseText = await callLLM(systemPrompt, prompt, config);
    
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

    const responseText = await callLLM(BATCH_SYSTEM_PROMPT, prompt, config);
    
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
 * Parse JSON response from LLM - handles various malformed formats
 */
function parseCategoriesJson(text: string, expectedWords: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  
  // Step 1: Strip <think/> tags (deepseek-reasoner adds these)
  let cleaned = text.replace(/<think[\s\S]*?<\/think>/gi, '');
  
  // Step 2: Extract JSON from markdown code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1];
  }
  
  // Step 3: Find JSON object in the text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('No JSON object found in response, trying line-by-line parsing');
    return parseLineByLine(text);
  }
  
  let jsonStr = jsonMatch[0];
  
  // Step 4: Fix common JSON issues
  // Remove trailing commas before } or ]
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
  // Replace single quotes with double quotes
  jsonStr = jsonStr.replace(/'/g, '"');
  // Add quotes around unquoted keys (word before colon)
  jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
  // Add quotes around unquoted string values (after colon, before comma or })
  jsonStr = jsonStr.replace(/:\s*([a-zA-Z_]\w*)(\s*[,}])/g, ':"$1"$2');
  // Remove JS-style comments
  jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
  jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    for (const [word, category] of Object.entries(parsed)) {
      const normalizedWord = word.toLowerCase().trim().replace(/^["']|["']$/g, '');
      const normalizedCategory = String(category).toLowerCase().trim().replace(/^["']|["']$/g, '');
      
      if (themeSlugs.includes(normalizedCategory)) {
        result[normalizedWord] = normalizedCategory;
      } else {
        result[normalizedWord] = extractCategory(normalizedCategory);
      }
    }
  } catch (e) {
    console.error('Failed to parse JSON after cleanup:', e);
    console.error('Attempted to parse:', jsonStr.slice(0, 500));
    return parseLineByLine(text);
  }
  
  return result;
}

/**
 * Fallback: parse word-category pairs line by line
 */
function parseLineByLine(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Try patterns like: "word": "category" or word: category or word -> category
    const patterns = [
      /["']?(\w+)["']?\s*[:=]\s*["']?(\w+)["']?/,           // "word": "category"
      /(\w+)\s*[-→>]+\s*(\w+)/,                                // word -> category
      /^\s*(\d+)\.\s*["']?(\w+)["']?\s*[-:]\s*["']?(\w+)["']?/, // 1. word: category
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const word = (match[1] || match[2]).toLowerCase();
        const category = (match[2] || match[3]).toLowerCase();
        if (themeSlugs.includes(category)) {
          result[word] = category;
          break;
        }
      }
    }
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
 * Check if LLM service is available
 */
export async function checkLLMAvailability(): Promise<{ 
  available: boolean; 
  provider?: string;
  model?: string; 
  error?: string 
}> {
  try {
    const config = await getLLMConfig();
    
    const result = await categorizeWord('test', 'a procedure intended to establish quality', ['noun']);
    
    if (result) {
      return { available: true, provider: config.provider, model: config.model };
    }
    
    return { available: false, provider: config.provider, error: 'No response from model' };
    
  } catch (error: any) {
    return { 
      available: false, 
      error: error.message || 'Connection failed' 
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
    
    if (piAiProviders.includes(config.provider.toLowerCase())) {
      if (config.apiKey) {
        const envKey = config.provider.toLowerCase() === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
        process.env[envKey] = config.apiKey;
      }
      
      const model = getModel(config.provider.toLowerCase() as any, config.model as any);
      
      if (model) {
        const context: Context = {
          systemPrompt: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: 'Say "ok"', timestamp: Date.now() }]
        };
        
        await completeSimple(model, context);
        return { success: true };
      }
    }
    
    // Custom provider - use pi-ai with custom model
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
      maxTokens: 100,
    };
    
    const context: Context = {
      systemPrompt: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'Say "ok"', timestamp: Date.now() }]
    };
    
    await completeSimple(customModel as any, context, {
      apiKey: config.apiKey,
    });
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
}

export { THEMES };
