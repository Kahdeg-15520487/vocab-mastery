import { getModel, completeSimple, type Context, type Tool } from '@mariozechner/pi-ai';
import OpenAI from 'openai';
import prisma from './prisma.js';

// Config cache
let cachedConfig: {
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
];

const themeSlugs = [...THEMES.map(t => t.slug), 'general'];

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
 * Get LLM config from database or environment
 */
export async function getLLMConfig(): Promise<{
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  context?: string;
}> {
  if (cachedConfig) return cachedConfig;

  try {
    const configs = await prisma.systemConfig.findMany({
      where: {
        key: { in: ['llm.provider', 'llm.model', 'llm.api_key', 'llm.base_url', 'llm.context'] }
      }
    });

    const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

    cachedConfig = {
      provider: configMap['llm.provider'] || process.env.LLM_PROVIDER || 'openai',
      model: configMap['llm.model'] || process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: configMap['llm.api_key'] || process.env.OPENAI_API_KEY,
      baseUrl: configMap['llm.base_url'] || process.env.LLM_BASE_URL,
      context: configMap['llm.context'] || process.env.LLM_CONTEXT || 'You are a helpful assistant.',
    };

    return cachedConfig;
  } catch (error) {
    // Fallback to env vars if database fails
    return {
      provider: process.env.LLM_PROVIDER || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      context: process.env.LLM_CONTEXT || 'You are a helpful assistant.',
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
 * Call LLM API (either pi-ai or direct OpenAI SDK)
 */
async function callLLM(systemPrompt: string, userPrompt: string, config: Awaited<ReturnType<typeof getLLMConfig>>): Promise<string> {
  const piAiProviders = ['openai', 'anthropic', 'google', 'groq', 'openrouter', 'mistral', 'cerebras', 'xai'];
  
  const useDirectSDK = !piAiProviders.includes(config.provider.toLowerCase()) || 
    (config.baseUrl && !config.baseUrl.includes('openai.com') && !config.baseUrl.includes('anthropic.com'));
  
  console.log(`[LLM] Calling ${config.provider} (${config.model}) via ${useDirectSDK ? 'direct SDK' : 'pi-ai'}`);
  console.log(`[LLM] Base URL: ${config.baseUrl || 'default'}`);
  console.log(`[LLM] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[LLM] User prompt length: ${userPrompt.length} chars`);
  
  const startTime = Date.now();
  
  if (useDirectSDK) {
    const openai = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseUrl || undefined,
    });
    
    console.log(`[LLM] Sending request to ${config.baseUrl || 'OpenAI default'}...`);
    
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });
    
    const elapsed = Date.now() - startTime;
    const content = response.choices[0]?.message?.content?.trim() || '';
    
    console.log(`[LLM] Response received in ${elapsed}ms`);
    console.log(`[LLM] Response length: ${content.length} chars`);
    console.log(`[LLM] Tokens used: ${response.usage ? `prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}, total=${response.usage.total_tokens}` : 'N/A'}`);
    
    return content;
  } else {
    const effectiveProvider = config.provider.toLowerCase();
    
    if (config.apiKey) {
      if (effectiveProvider === 'anthropic') {
        process.env.ANTHROPIC_API_KEY = config.apiKey;
      } else {
        process.env.OPENAI_API_KEY = config.apiKey;
      }
    }
    
    const model = getModel(effectiveProvider as any, config.model as any);
    
    if (!model) {
      console.log(`[LLM] Model "${config.model}" not found in pi-ai, falling back to direct SDK`);
      const openai = new OpenAI({
        apiKey: config.apiKey || process.env.OPENAI_API_KEY,
        baseURL: config.baseUrl || undefined,
      });
      
      const response = await openai.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      });
      
      const elapsed = Date.now() - startTime;
      const content = response.choices[0]?.message?.content?.trim() || '';
      
      console.log(`[LLM] Response received in ${elapsed}ms`);
      console.log(`[LLM] Response length: ${content.length} chars`);
      
      return content;
    }
    
    const context: Context = {
      systemPrompt,
      messages: [
        { role: 'user', content: userPrompt, timestamp: Date.now() }
      ]
    };
    
    console.log(`[LLM] Sending request via pi-ai...`);
    
    const response = await completeSimple(model, context);
    
    const elapsed = Date.now() - startTime;
    const content = response.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim();
    
    console.log(`[LLM] Response received in ${elapsed}ms`);
    console.log(`[LLM] Response length: ${content.length} chars`);
    if (response.usage) {
      console.log(`[LLM] Tokens: input=${response.usage.input}, output=${response.usage.output}, total=${response.usage.totalTokens}`);
    }
    
    return content;
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
 * This is much more efficient than individual requests
 */
export async function categorizeWordsBatch(
  words: Array<{ word: string; definition?: string; partOfSpeech?: string[] }>,
  options?: { onProgress?: (done: number, total: number) => void }
): Promise<Array<{ word: string; category: string }>> {
  if (words.length === 0) return [];
  
  console.log(`[LLM] Starting batch categorization of ${words.length} words`);
  
  try {
    const config = await getLLMConfig();
    
    // Build the prompt with all words
    const wordsList = words.map((w, i) => {
      let entry = `${i + 1}. "${w.word}"`;
      if (w.partOfSpeech?.length) {
        entry += ` (${w.partOfSpeech.join(', ')})`;
      }
      if (w.definition) {
        // Truncate long definitions
        const def = w.definition.length > 100 ? w.definition.slice(0, 100) + '...' : w.definition;
        entry += `: ${def}`;
      }
      return entry;
    }).join('\n');
    
    const prompt = `Categorize the following ${words.length} English words. Return a JSON object where each key is the word and value is the category slug.

Words:
${wordsList}

Return ONLY a valid JSON object like: {"word1": "category", "word2": "category", ...}`;

    console.log(`[LLM] Prompt built: ${wordsList.split('\n').length} word entries`);
    
    const startTime = Date.now();
    const responseText = await callLLM(BATCH_SYSTEM_PROMPT, prompt, config);
    const elapsed = Date.now() - startTime;
    
    console.log(`[LLM] Batch request completed in ${elapsed}ms`);
    
    // Parse JSON response
    const categories = parseCategoriesJson(responseText, words.map(w => w.word));
    
    console.log(`[LLM] Parsed ${Object.keys(categories).length} categories from response`);
    
    // Log category distribution
    const distribution: Record<string, number> = {};
    for (const word of words) {
      const cat = categories[word.word.toLowerCase()] || 'general';
      distribution[cat] = (distribution[cat] || 0) + 1;
    }
    console.log(`[LLM] Category distribution: ${JSON.stringify(distribution)}`);
    
    if (options?.onProgress) {
      options.onProgress(words.length, words.length);
    }
    
    return words.map(w => ({
      word: w.word,
      category: categories[w.word.toLowerCase()] || 'general',
    }));
    
  } catch (error: any) {
    console.error(`[LLM] Batch categorization failed:`, error.message);
    console.error(`[LLM] Error stack:`, error.stack);
    // Return all as general on failure
    return words.map(w => ({ word: w.word, category: 'general' }));
  }
}

/**
 * Parse JSON response from LLM, with fallback extraction
 */
function parseCategoriesJson(text: string, expectedWords: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  
  // Try to extract JSON from the response
  let jsonStr = text;
  
  // Find JSON object in response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Normalize keys to lowercase and validate categories
    for (const [word, category] of Object.entries(parsed)) {
      const normalizedWord = word.toLowerCase().trim();
      const normalizedCategory = String(category).toLowerCase().trim();
      
      if (themeSlugs.includes(normalizedCategory)) {
        result[normalizedWord] = normalizedCategory;
      } else {
        result[normalizedWord] = extractCategory(normalizedCategory);
      }
    }
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    // Try line-by-line extraction
    const lines = text.split('\n');
    for (const line of lines) {
      // Try patterns like: "word": "category" or word: category
      const match = line.match(/["']?(\w+)["']?\s*[:=]\s*["']?(\w+)["']?/);
      if (match) {
        const word = match[1].toLowerCase();
        const category = match[2].toLowerCase();
        if (themeSlugs.includes(category)) {
          result[word] = category;
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
 * Batch categorize multiple words with concurrency control (legacy - individual requests)
 * Use categorizeWordsBatch for efficiency
 */
export async function categorizeWords(
  words: Array<{ word: string; definition?: string; partOfSpeech?: string[] }>,
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void }
): Promise<Array<{ word: string; category: string }>> {
  // Use the new batch function for efficiency
  return categorizeWordsBatch(words, options);
}

/**
 * Check if LLM service is available
 */
export async function checkLLMAvailability(): Promise<{ 
  available: boolean; 
  provider: string; 
  model?: string; 
  error?: string 
}> {
  try {
    const config = await getLLMConfig();
    
    // Test with a simple categorization
    const result = await categorizeWord('test', 'a procedure intended to establish quality', ['noun']);
    
    if (result) {
      return { available: true, provider: config.provider, model: config.model };
    }
    
    return { available: false, provider: config.provider, error: 'No response from model' };
    
  } catch (error: any) {
    const config = await getLLMConfig();
    return { 
      available: false, 
      provider: config.provider, 
      error: error.message || 'Connection failed' 
    };
  }
}

export { THEMES };
