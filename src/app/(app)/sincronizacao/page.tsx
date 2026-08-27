import { prisma } from "@/lib/prisma";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { SincronizarTodasButton } from "./sincronizar-todas-button";

export default async function SincronizacaoPage() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { empresa: { select: { razaoSocial: true, cnpj: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sincronização</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Rodada automática diária (NF-e e NFS-e — ver <code>vercel.json</code>), ou dispare
            manualmente.
          </p>
        </div>
        <SincronizarTodasButton />
      </div>

      {logs.length === 0 ? (
        <EmptyState>Nenhuma sincronização executada ainda.</EmptyState>
      ) : (
        <Card className="divide-y divide-gridline p-0">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {log.empresa.razaoSocial}{" "}
                  <span className="font-normal text-ink-muted">
                    · {log.tipoDocumento === "NFSE" ? "NFS-e" : "NF-e"}
                  </span>
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {log.startedAt.toLocaleString("pt-BR")}
                  {log.notasNovas > 0 && ` · ${log.notasNovas} nota(s) nova(s)`}
                  {log.mensagem && ` · ${log.mensagem}`}
                </p>
              </div>
              <StatusBadge
                status={log.status}
                label={
                  log.status === "SUCESSO"
                    ? "Sucesso"
                    : log.status === "ERRO"
                      ? "Erro"
                      : "Em andamento"
                }
              />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
