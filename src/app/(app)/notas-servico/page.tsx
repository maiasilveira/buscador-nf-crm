import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, Select } from "@/components/ui";
import { formatCnpj } from "@/lib/cnpj";

export default async function NotasServicoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresaId?: string }>;
}) {
  const { empresaId } = await searchParams;

  const [empresas, notas] = await Promise.all([
    prisma.empresa.findMany({ orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true } }),
    prisma.notaServico.findMany({
      where: empresaId ? { empresaId } : {},
      orderBy: { dataEmissao: "desc" },
      take: 200,
      include: { empresa: { select: { razaoSocial: true, cnpj: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Notas de serviço (NFS-e)</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Coletadas via Sistema Nacional NFS-e — cobertura parcial, só municípios que já
          aderiram ao padrão nacional. Veja o aviso no README.
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
        <button
          type="submit"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-black/[.03] dark:hover:bg-white/[.06]"
        >
          Filtrar
        </button>
      </form>

      {notas.length === 0 ? (
        <EmptyState>Nenhuma NFS-e coletada ainda.</EmptyState>
      ) : (
        <Card className="divide-y divide-gridline p-0">
          {notas.map((nota) => (
            <Link
              key={nota.id}
              href={`/notas-servico/${nota.id}`}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{nota.prestadorNome}</p>
                <p className="truncate text-xs text-ink-muted">
                  NFS-e {nota.numero} · R${" "}
                  {Number(nota.valorServico).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{" "}
                  · {nota.dataEmissao.toLocaleDateString("pt-BR")} · {formatCnpj(nota.empresa.cnpj)}
                </p>
              </div>
              {nota.clickupTaskId && <span className="text-xs text-ink-muted shrink-0">ClickUp ✓</span>}
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
