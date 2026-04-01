-- AlterTable: Add reasoning column to LlmProvider
ALTER TABLE "llm_providers" ADD COLUMN IF NOT EXISTS "reasoning" boolean NOT NULL DEFAULT true;
