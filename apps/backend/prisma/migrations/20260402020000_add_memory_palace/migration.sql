-- Add memory palace column for LLM-generated visual mnemonics
ALTER TABLE "words" ADD COLUMN "memory_palace" TEXT;
