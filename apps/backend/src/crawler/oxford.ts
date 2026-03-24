import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CrawlResult } from './types.js';

const BASE_URL = 'https://www.oxfordlearnersdictionaries.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Fetch word page from Oxford Learners Dictionary
 */
async function fetchWordPage(word: string): Promise<string | null> {
  try {
    const url = `${BASE_URL}/definition/english/${encodeURIComponent(word)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000,
      validateStatus: (status) => status === 200,
    });
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null; // Word not found
    }
    throw error;
  }
}

/**
 * Parse Oxford dictionary HTML page
 */
function parseOxfordPage(html: string, word: string): CrawlResult {
  const $ = cheerio.load(html);
  const result: CrawlResult = { word, success: false };

  try {
    // Check if we got a valid definition page
    const entryContent = $('.entry');
    if (entryContent.length === 0) {
      // Try redirect suggestion
      const suggestion = $('.did-you-mean a').first().text().trim();
      if (suggestion) {
        result.error = `Not found. Suggestion: ${suggestion}`;
      } else {
        result.error = 'No definition found';
      }
      return result;
    }

    // Extract phonetics - class is "phon" not "phonetic"
    const ukPhonetic = $('.phons_br .phon').first().text().trim();
    const usPhonetic = $('.phons_n_am .phon').first().text().trim();
    result.phoneticUk = ukPhonetic || undefined;
    result.phoneticUs = usPhonetic || undefined;

    // Extract parts of speech
    const partsOfSpeech: Set<string> = new Set();
    $('.pos').each((_, el) => {
      const pos = $(el).text().trim();
      if (pos) partsOfSpeech.add(pos);
    });
    result.partOfSpeech = Array.from(partsOfSpeech);

    // Extract definitions (take first few)
    const definitions: string[] = [];
    $('.def').each((_, el) => {
      const def = $(el).text().trim();
      if (def && definitions.length < 5) {
        definitions.push(def);
      }
    });
    result.definitions = definitions;

    // Extract examples
    const examples: string[] = [];
    $('.examples .x').each((_, el) => {
      const example = $(el).text().trim();
      if (example && examples.length < 5) {
        examples.push(example);
      }
    });
    result.examples = examples;

    // Extract synonyms from related words section
    const synonyms: string[] = [];
    $('[data-trigger="synonyms"] .xrefs .Ref, .xrefs .xref').each((_, el) => {
      const syn = $(el).text().trim();
      if (syn && synonyms.length < 10) {
        synonyms.push(syn);
      }
    });
    result.synonyms = synonyms.length > 0 ? synonyms : undefined;

    // Extract antonyms
    const antonyms: string[] = [];
    $('[data-trigger="opposite"] .xrefs .Ref, [data-trigger="opposite"] .xref').each((_, el) => {
      const ant = $(el).text().trim();
      if (ant && antonyms.length < 10) {
        antonyms.push(ant);
      }
    });
    result.antonyms = antonyms.length > 0 ? antonyms : undefined;

    result.success = definitions.length > 0;
    
    if (!result.success) {
      result.error = 'No definitions extracted';
    }

  } catch (error: any) {
    result.error = `Parse error: ${error.message}`;
  }

  return result;
}

/**
 * Crawl a single word from Oxford Dictionary
 */
export async function crawlWord(word: string): Promise<CrawlResult> {
  const html = await fetchWordPage(word);
  
  if (!html) {
    return { word, success: false, error: 'Word not found (404)' };
  }

  return parseOxfordPage(html, word);
}

/**
 * Sleep utility for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
