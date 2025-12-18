-- CreateTable
CREATE TABLE "registration_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_tokens_email_key" ON "registration_tokens"("email");

-- CreateIndex
CREATE UNIQUE INDEX "registration_tokens_token_key" ON "registration_tokens"("token");

-- CreateIndex
CREATE INDEX "registration_tokens_email_idx" ON "registration_tokens"("email");

-- CreateIndex
CREATE INDEX "registration_tokens_token_idx" ON "registration_tokens"("token");

-- CreateIndex
CREATE INDEX "registration_tokens_expiresAt_idx" ON "registration_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "registration_tokens_tenantId_idx" ON "registration_tokens"("tenantId");

-- AddForeignKey
ALTER TABLE "registration_tokens" ADD CONSTRAINT "registration_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
