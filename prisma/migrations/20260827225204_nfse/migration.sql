-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "lastSyncNfseAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncNfseError" TEXT,
ADD COLUMN     "maxNsuNfse" TEXT NOT NULL DEFAULT '000000000000000',
ADD COLUMN     "ultNsuNfse" TEXT NOT NULL DEFAULT '000000000000000';

-- AlterTable
ALTER TABLE "SyncLog" ADD COLUMN     "tipoDocumento" TEXT NOT NULL DEFAULT 'NFE';

-- CreateTable
CREATE TABLE "NotaServico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "prestadorCnpj" TEXT NOT NULL,
    "prestadorNome" TEXT NOT NULL,
    "tomadorCnpj" TEXT NOT NULL,
    "valorServico" DECIMAL(14,2) NOT NULL,
    "discriminacao" TEXT,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "xmlCompleto" TEXT NOT NULL,
    "clickupTaskId" TEXT,
    "clickupTaskUrl" TEXT,
    "clickupSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaServico_chaveAcesso_key" ON "NotaServico"("chaveAcesso");

-- CreateIndex
CREATE INDEX "NotaServico_empresaId_idx" ON "NotaServico"("empresaId");

-- AddForeignKey
ALTER TABLE "NotaServico" ADD CONSTRAINT "NotaServico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
