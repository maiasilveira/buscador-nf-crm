-- Migração de dados (sem mudança de schema): novo recurso "Número do
-- Pedido" (ver src/lib/numero-pedido.ts) extrai, de "Informações
-- Complementares" do XML, o número de pedido que o fornecedor é instruído
-- a incluir na nota — mas isso só roda dentro de anexarDanfeSeDisponivel/
-- anexarDanfseSeDisponivel (src/lib/sefaz/sync.ts e src/lib/nfse/sync.ts),
-- que o backfill retroativo (botão "Gerar PDFs", src/app/actions/pdfs.ts)
-- só reprocessa em notas com pdfAnexado=false.
--
-- Reseta pdfAnexado pra false em toda NotaFiscal já completa e toda
-- NotaServico, fazendo esse mesmo botão reprocessar todas — reanexa o
-- PDF (idempotente, sem problema) e extrai/envia o Número do Pedido pro
-- ClickUp pras notas já coletadas antes desse recurso existir. Mesmo
-- padrão usado na migração 20260924140457_reset_pdf_anexado_nfse.
UPDATE "NotaFiscal" SET "pdfAnexado" = false WHERE "status" = 'COMPLETA';
UPDATE "NotaServico" SET "pdfAnexado" = false;