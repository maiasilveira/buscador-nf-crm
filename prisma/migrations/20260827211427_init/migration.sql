-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT 'PRODUCAO',
    "uf" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "certPfxEnc" BYTEA,
    "certPasswordEnc" TEXT,
    "certSubject" TEXT,
    "certValidUntil" TIMESTAMP(3),
    "ultNsu" TEXT NOT NULL DEFAULT '000000000000000',
    "maxNsu" TEXT NOT NULL DEFAULT '000000000000000',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "emitenteCnpj" TEXT NOT NULL,
    "emitenteNome" TEXT NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESUMO',
    "xmlResumo" TEXT,
    "xmlCompleto" TEXT,
    "manifestadaEm" TIMESTAMP(3),
    "clickupTaskId" TEXT,
    "clickupTaskUrl" TEXT,
    "clickupSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "notasNovas" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "Empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_chaveAcesso_key" ON "NotaFiscal"("chaveAcesso");

-- CreateIndex
CREATE INDEX "NotaFiscal_empresaId_idx" ON "NotaFiscal"("empresaId");

-- CreateIndex
CREATE INDEX "NotaFiscal_status_idx" ON "NotaFiscal"("status");

-- CreateIndex
CREATE INDEX "SyncLog_empresaId_idx" ON "SyncLog"("empresaId");

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
