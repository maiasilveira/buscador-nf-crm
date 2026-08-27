import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { formatCnpj } from "@/lib/cnpj";

export default async function NotaServicoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nota = await prisma.notaServico.findUnique({ where: { id }, include: { empresa: true } });
  if (!nota) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/notas-servico" className="text-xs text-ink-muted underline underline-offset-2">
          ← Notas de serviço
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">NFS-e {nota.numero}</h1>
      </div>

      <Card className="space-y-2 text-sm">
        <Row label="Chave de acesso">
          <code className="text-xs">{nota.chaveAcesso}</code>
        </Row>
        <Row label="Prestador">
          {nota.prestadorNome} ({formatCnpj(nota.prestadorCnpj)})
        </Row>
        <Row label="Tomador (empresa cadastrada)">
          {nota.empresa.razaoSocial} ({formatCnpj(nota.empresa.cnpj)})
        </Row>
        <Row label="Data de emissão">{nota.dataEmissao.toLocaleString("pt-BR")}</Row>
        <Row label="Valor do serviço">
          R$ {Number(nota.valorServico).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </Row>
        {nota.discriminacao && <Row label="Discriminação">{nota.discriminacao}</Row>}
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

      <Card className="text-sm">
        <h2 className="mb-2 font-semibold text-ink-secondary">Arquivo XML</h2>
        <a
          href={`/api/notas-servico/${nota.id}/xml`}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/[.03] dark:hover:bg-white/[.06]"
        >
          Baixar XML
        </a>
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
