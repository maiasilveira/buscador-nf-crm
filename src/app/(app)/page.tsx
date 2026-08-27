import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { formatCnpj } from "@/lib/cnpj";

export default async function DashboardPage() {
  const [totalEmpresas, empresasAtivas, totalNotas, notasResumo, ultimasNotas] =
    await Promise.all([
      prisma.empresa.count(),
      prisma.empresa.count({ where: { active: true } }),
      prisma.notaFiscal.count(),
      prisma.notaFiscal.count({ where: { status: "RESUMO" } }),
      prisma.notaFiscal.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { empresa: { select: { razaoSocial: true, cnpj: true } } },
      }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Visão geral</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Coleta automática de notas fiscais na SEFAZ, com envio ao ClickUp.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-ink-muted">Empresas cadastradas</p>
          <p className="mt-1 text-2xl font-semibold">{totalEmpresas}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-ink-muted">Empresas ativas</p>
          <p className="mt-1 text-2xl font-semibold">{empresasAtivas}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-ink-muted">Notas coletadas</p>
          <p className="mt-1 text-2xl font-semibold">{totalNotas}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-ink-muted">Aguardando XML completo</p>
          <p className="mt-1 text-2xl font-semibold">{notasResumo}</p>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-secondary">Últimas notas coletadas</h2>
          <Link href="/notas" className="text-xs font-medium text-accent underline underline-offset-2">
            Ver todas
          </Link>
        </div>
        {ultimasNotas.length === 0 ? (
          <EmptyState>
            Nenhuma nota coletada ainda. Cadastre uma empresa em &ldquo;Empresas&rdquo; e
            sincronize.
          </EmptyState>
        ) : (
          <Card className="divide-y divide-gridline p-0">
            {ultimasNotas.map((nota) => (
              <Link
                key={nota.id}
                href={`/notas/${nota.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.03]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{nota.emitenteNome}</p>
                  <p className="truncate text-xs text-ink-muted">
                    NF {nota.numero}/{nota.serie} · {formatCnpj(nota.empresa.cnpj)} ·{" "}
                    {nota.empresa.razaoSocial}
                  </p>
                </div>
                <StatusBadge
                  status={nota.status}
                  label={nota.status === "COMPLETA" ? "XML completo" : "Resumo"}
                />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
