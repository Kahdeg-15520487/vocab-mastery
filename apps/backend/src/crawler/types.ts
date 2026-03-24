export interface CrawlResult {
  word: string;
  success: boolean;
  phoneticUs?: string;
  phoneticUk?: string;
  partOfSpeech?: string[];
  definitions?: string[];
  examples?: string[];
  synonyms?: string[];
  antonyms?: string[];
  error?: string;
}

export interface CrawlerConfig {
  batchSize: number;
  delayMs: number;
  dryRun: boolean;
}

export const DEFAULT_CONFIG: CrawlerConfig = {
  batchSize: 100,
  delayMs: 1500,
  dryRun: false,
};
