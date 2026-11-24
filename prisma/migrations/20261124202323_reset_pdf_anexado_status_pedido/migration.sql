-- Migração de dados (sem mudança de schema): novo campo "Status do Pedido"
-- (dropdown Possui/Conferir/Não possui — ver src/lib/numero-pedido.ts) é
-- enviado pro ClickUp no mesmo lugar que "Número do Pedido"
-- (anexarDanfeSeDisponivel/anexarDanfseSeDisponivel). Se o backfill (botão
-- "Gerar PDFs") já rodou depois da migração anterior
-- (20261124200733_reset_pdf_anexado_numero_pedido) mas antes desse campo
-- existir, essas notas ficaram com pdfAnexado=true sem nunca terem
-- recebido "Status do Pedido". Reseta de novo pra garantir que toda nota
-- seja reprocessada pelo menos uma vez já com os dois campos.
UPDATE "NotaFiscal" SET "pdfAnexado" = false WHERE "status" = 'COMPLETA';
UPDATE "NotaServico" SET "pdfAnexado" = false;