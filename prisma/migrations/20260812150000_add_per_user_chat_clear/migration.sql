ALTER TABLE "conversation_participants"
ADD COLUMN "clearedAt" TIMESTAMP(3),
ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "conversation_participants_userId_isHidden_idx"
ON "conversation_participants"("userId", "isHidden");
