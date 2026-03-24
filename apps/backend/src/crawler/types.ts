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
  maxRetries: number;
  resume: boolean;
  dryRun: boolean;
  startFrom?: string;
}

export interface CrawlProgress {
  totalProcessed: number;
  successCount: number;
  failCount: number;
  skippedCount: number;
  lastWord: string;
  startTime: string;
  endTime?: string;
}

export const DEFAULT_CONFIG: CrawlerConfig = {
  batchSize: 100,
  delayMs: 1500,
  maxRetries: 3,
  resume: true,
  dryRun: false,
};
