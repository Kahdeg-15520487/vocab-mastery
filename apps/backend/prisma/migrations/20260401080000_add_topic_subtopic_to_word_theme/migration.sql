-- AlterTable: add topic and subtopic columns to word_themes
ALTER TABLE "word_themes" ADD COLUMN "topic" TEXT;
ALTER TABLE "word_themes" ADD COLUMN "subtopic" TEXT;

-- CreateIndex
CREATE INDEX "word_themes_topic_idx" ON "word_themes"("topic");
