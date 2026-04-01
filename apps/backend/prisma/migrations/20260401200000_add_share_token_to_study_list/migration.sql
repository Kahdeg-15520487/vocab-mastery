-- AlterTable: add share token for public list sharing
ALTER TABLE "study_lists" ADD COLUMN "share_token" TEXT;
CREATE UNIQUE INDEX "study_lists_share_token_key" ON "study_lists"("share_token");
