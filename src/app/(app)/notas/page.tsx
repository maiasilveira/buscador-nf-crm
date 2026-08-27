import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, Select, StatusBadge } from "@/components/ui";
import { formatCnpj } from "@/lib/cnpj";

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ empresaId?: string; status?: string }>;
}) {
  const { empresaId, status } = await searchParams;

  const [empresas, notas] = await Promise.all([
    prisma.empresa.findMany({ orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true } }),
    prisma.notaFiscal.findMany({
      where: {
        ...(empresaId ? { empresaId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { dataEmissao: "desc" },
      take: 200,
      include: { empresa: { select: { razaoSocial: true, cnpj: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Notas fiscais</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Notas coletadas automaticamente na SEFAZ para as empresas cadastradas.
        </p>
      </div>

      <form className="flex flex-wrap gap-3" method="get">
        <Select name="empresaId" defaultValue={empresaId ?? ""} className="w-auto">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.razaoSocial}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} className="w-auto">
          <option value="">Todos os status</option>
          <option value="RESUMO">Só resumo</option>
          <option value="COMPLETA">XML completo</option>
        </Select>
        <button
          type="submit"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-black/[.03] dark:hover:bg-white/[.06]"
        >
          Filtrar
        </button>
      </form>

      {notas.length === 0 ? (
        <EmptyState>Nenhuma nota encontrada.</EmptyState>
      ) : (
        <Card className="divide-y divide-gridline p-0">
          {notas.map((nota) => (
            <Link
              key={nota.id}
              href={`/notas/${nota.id}`}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{nota.emitenteNome}</p>
                <p className="truncate text-xs text-ink-muted">
                  NF {nota.numero}/{nota.serie} · R${" "}
                  {Number(nota.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ·{" "}
                  {nota.dataEmissao.toLocaleDateString("pt-BR")} ·{" "}
                  {formatCnpj(nota.empresa.cnpj)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {nota.clickupTaskId && (
                  <span className="text-xs text-ink-muted">ClickUp ✓</span>
                )}
                <StatusBadge
                  status={nota.status}
                  label={nota.status === "COMPLETA" ? "XML completo" : "Resumo"}
                />
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
