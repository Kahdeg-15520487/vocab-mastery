import { getModel, completeSimple, type Context, type Tool } from '@mariozechner/pi-ai';
import prisma from './prisma.js';

// Config cache
let cachedConfig: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
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

const SYSTEM_PROMPT = `You are a word categorization assistant. Your task is to categorize English vocabulary words into exactly one category.

Available categories:
${THEMES.map(t => `- ${t.slug}: ${t.name} (${t.description})`).join('\n')}

Rules:
1. Return ONLY the category slug (one word)
2. If a word doesn't clearly fit any category, return "general"
3. Be consistent - similar words should get the same category
4. Consider the word's primary/most common meaning`;

/**
 * Get LLM config from database or environment
 */
export async function getLLMConfig(): Promise<{
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}> {
  if (cachedConfig) return cachedConfig;

  try {
    const configs = await prisma.systemConfig.findMany({
      where: {
        key: { in: ['llm.provider', 'llm.model', 'llm.api_key', 'llm.base_url'] }
      }
    });

    const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

    cachedConfig = {
      provider: configMap['llm.provider'] || process.env.LLM_PROVIDER || 'openai',
      model: configMap['llm.model'] || process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: configMap['llm.api_key'] || process.env.OPENAI_API_KEY,
      baseUrl: configMap['llm.base_url'] || process.env.OLLAMA_BASE_URL,
    };

    return cachedConfig;
  } catch (error) {
    // Fallback to env vars if database fails
    return {
      provider: process.env.LLM_PROVIDER || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OLLAMA_BASE_URL,
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
 * Categorize a word using LLM
 */
export async function categorizeWord(
  word: string,
  definition?: string,
  partOfSpeech?: string[]
): Promise<string> {
  try {
    const config = await getLLMConfig();
    
    // Get the model
    const model = getModel(config.provider as any, config.model as any);
    
    // Build user prompt
    let prompt = `Categorize this English word:\n\nWord: "${word}"`;
    if (partOfSpeech?.length) {
      prompt += `\nPart of speech: ${partOfSpeech.join(', ')}`;
    }
    if (definition) {
      prompt += `\nDefinition: ${definition.slice(0, 500)}`;
    }
    prompt += `\n\nReturn ONLY the category slug (one of: ${themeSlugs.join(', ')}). No explanation.`;
    
    // Create context
    const context: Context = {
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: prompt, timestamp: Date.now() }
      ]
    };
    
    // Get response
    const response = await completeSimple(model, context);
    
    // Extract text from response
    const text = response.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim()
      .toLowerCase();
    
    return extractCategory(text);
    
  } catch (error) {
    console.error(`Failed to categorize "${word}":`, error);
    return 'general';
  }
}

function extractCategory(text: string): string {
  // Clean up the response - remove punctuation and whitespace
  const cleaned = text.replace(/[^a-z]/g, '').trim();
  
  // Check if it's a valid category
  if (themeSlugs.includes(cleaned)) {
    return cleaned;
  }
  
  // Try to find partial match
  for (const cat of themeSlugs) {
    if (cleaned.includes(cat) || cat.includes(cleaned)) {
      return cat;
    }
  }
  
  // Check for words that might indicate a category
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
 * Batch categorize multiple words with concurrency control
 */
export async function categorizeWords(
  words: Array<{ word: string; definition?: string; partOfSpeech?: string[] }>,
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void }
): Promise<Array<{ word: string; category: string }>> {
  const concurrency = options?.concurrency || 5;
  const results: Array<{ word: string; category: string }> = [];
  
  // Process in batches
  for (let i = 0; i < words.length; i += concurrency) {
    const batch = words.slice(i, i + concurrency);
    
    const batchResults = await Promise.all(
      batch.map(async (w) => ({
        word: w.word,
        category: await categorizeWord(w.word, w.definition, w.partOfSpeech),
      }))
    );
    
    results.push(...batchResults);
    
    if (options?.onProgress) {
      options.onProgress(results.length, words.length);
    }
  }
  
  return results;
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
    
    // If we got a valid result, it's working
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
