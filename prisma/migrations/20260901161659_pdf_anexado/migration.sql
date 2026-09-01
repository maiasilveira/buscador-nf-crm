-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "pdfAnexado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NotaServico" ADD COLUMN     "pdfAnexado" BOOLEAN NOT NULL DEFAULT false;
