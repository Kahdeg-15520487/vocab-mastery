-- CreateTable
CREATE TABLE "word_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "word_favorites_user_id_word_id_key" ON "word_favorites"("user_id", "word_id");

-- CreateIndex
CREATE INDEX "word_favorites_user_id_idx" ON "word_favorites"("user_id");

-- CreateIndex
CREATE INDEX "word_favorites_word_id_idx" ON "word_favorites"("word_id");

-- AddForeignKey
ALTER TABLE "word_favorites" ADD CONSTRAINT "word_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_favorites" ADD CONSTRAINT "word_favorites_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
