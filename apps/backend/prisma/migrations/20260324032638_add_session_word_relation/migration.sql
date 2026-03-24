-- CreateIndex
CREATE INDEX "session_words_word_id_idx" ON "session_words"("word_id");

-- AddForeignKey
ALTER TABLE "session_words" ADD CONSTRAINT "session_words_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
