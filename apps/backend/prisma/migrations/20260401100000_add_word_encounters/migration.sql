-- CreateTable
CREATE TABLE "word_encounters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_encounters_user_id_idx" ON "word_encounters"("user_id");
CREATE INDEX "word_encounters_word_id_idx" ON "word_encounters"("word_id");
CREATE INDEX "word_encounters_user_id_word_id_idx" ON "word_encounters"("user_id", "word_id");

-- AddForeignKey
ALTER TABLE "word_encounters" ADD CONSTRAINT "word_encounters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "word_encounters" ADD CONSTRAINT "word_encounters_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
