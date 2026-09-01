import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, StatusBadge } from "@/components/ui";
import { formatCnpj } from "@/lib/cnpj";

export default async function NotaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nota = await prisma.notaFiscal.findUnique({
    where: { id },
    include: { empresa: true },
  });
  if (!nota) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/notas" className="text-xs text-ink-muted underline underline-offset-2">
          ← Notas fiscais
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            NF {nota.numero}/{nota.serie}
          </h1>
          <StatusBadge status={nota.status} label={nota.status === "COMPLETA" ? "XML completo" : "Resumo"} />
        </div>
      </div>

      <Card className="space-y-2 text-sm">
        <Row label="Chave de acesso">
          <code className="text-xs">{nota.chaveAcesso}</code>
        </Row>
        <Row label="Emitente">
          {nota.emitenteNome} ({formatCnpj(nota.emitenteCnpj)})
        </Row>
        <Row label="Destinatário (empresa cadastrada)">
          {nota.empresa.razaoSocial} ({formatCnpj(nota.empresa.cnpj)})
        </Row>
        <Row label="Data de emissão">{nota.dataEmissao.toLocaleString("pt-BR")}</Row>
        <Row label="Valor total">
          R$ {Number(nota.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </Row>
        <Row label="Manifestada em">
          {nota.manifestadaEm ? nota.manifestadaEm.toLocaleString("pt-BR") : "Ainda não"}
        </Row>
        <Row label="Coletada em">{nota.createdAt.toLocaleString("pt-BR")}</Row>
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold text-ink-secondary">ClickUp</h2>
        {nota.clickupTaskUrl ? (
          <a
            href={nota.clickupTaskUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Abrir tarefa no ClickUp →
          </a>
        ) : nota.clickupSyncError ? (
          <p className="text-status-critical">Falha ao criar tarefa: {nota.clickupSyncError}</p>
        ) : (
          <p className="text-ink-muted">Tarefa ainda não criada.</p>
        )}
      </Card>

      <Card className="space-y-3 text-sm">
        <h2 className="font-semibold text-ink-secondary">Arquivos</h2>
        <div className="flex flex-wrap gap-3">
          {nota.xmlResumo && (
            <a
              href={`/api/notas/${nota.id}/xml?tipo=resumo`}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/[.03] dark:hover:bg-white/[.06]"
            >
              Baixar resumo (resNFe)
            </a>
          )}
          {nota.xmlCompleto && (
            <>
              <a
                href={`/api/notas/${nota.id}/xml?tipo=completo`}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/[.03] dark:hover:bg-white/[.06]"
              >
                Baixar XML completo (procNFe)
              </a>
              <a
                href={`/api/notas/${nota.id}/pdf`}
                className="rounded-full border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
              >
                Baixar PDF (DANFE)
              </a>
            </>
          )}
        </div>
        {!nota.xmlCompleto && (
          <p className="text-xs text-ink-muted">
            O XML completo (e o PDF/DANFE, que depende dele) só fica disponível depois da
            manifestação de ciência ser processada pela SEFAZ — normalmente na sincronização
            seguinte.
          </p>
        )}
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="w-56 shrink-0 text-xs font-medium text-ink-muted">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
