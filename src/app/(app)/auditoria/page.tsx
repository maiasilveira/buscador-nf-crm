import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { Card, EmptyState, Select } from "@/components/ui";
import type { AcaoAuditoria } from "@/lib/audit";

const ACAO_LABEL: Record<AcaoAuditoria, string> = {
  LOGIN_SUCESSO: "Login",
  LOGIN_FALHA: "Login falhou",
  LOGIN_BLOQUEADO: "Login bloqueado (força bruta)",
  LOGOUT: "Saiu",
  USUARIO_CRIADO: "Usuário criado",
  USUARIO_ATIVADO: "Usuário ativado",
  USUARIO_DESATIVADO: "Usuário desativado",
  USUARIO_SENHA_REDEFINIDA: "Senha redefinida",
  USUARIO_PAPEL_ALTERADO: "Papel alterado",
  EMPRESA_CRIADA: "Empresa criada",
  EMPRESA_EDITADA: "Empresa editada",
  CERTIFICADO_SUBSTITUIDO: "Certificado substituído",
  EMPRESA_ATIVADA: "Empresa ativada",
  EMPRESA_DESATIVADA: "Empresa desativada",
  EMPRESA_EXCLUIDA: "Empresa excluída",
  SYNC_DISPARADA_MANUAL: "Sincronização manual",
  SYNC_DISPARADA_CRON: "Sincronização automática (cron)",
  PDFS_RETROATIVOS_GERADOS: "PDFs retroativos gerados",
};

const ACAO_CRITICA = new Set<AcaoAuditoria>([
  "LOGIN_FALHA",
  "LOGIN_BLOQUEADO",
  "CERTIFICADO_SUBSTITUIDO",
  "EMPRESA_EXCLUIDA",
  "USUARIO_DESATIVADO",
]);

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  await requireAdmin();
  const { action } = await searchParams;

  const logs = await prisma.auditLog.findMany({
    where: action ? { action } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Auditoria</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Quem fez o quê no sistema — login, cadastro/edição de empresas e certificados,
          usuários, sincronizações. Nunca guarda senha ou certificado, só o registro do
          evento.
        </p>
      </div>

      <form className="flex flex-wrap gap-3" method="get">
        <Select name="action" defaultValue={action ?? ""} className="w-auto">
          <option value="">Todas as ações</option>
          {Object.entries(ACAO_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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

      {logs.length === 0 ? (
        <EmptyState>Nenhum evento registrado ainda.</EmptyState>
      ) : (
        <Card className="divide-y divide-gridline p-0">
          {logs.map((log) => {
            const critica = ACAO_CRITICA.has(log.action as AcaoAuditoria);
            return (
              <div key={log.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${critica ? "text-status-critical" : ""}`}>
                    {ACAO_LABEL[log.action as AcaoAuditoria] ?? log.action}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {log.user ? `${log.user.name} (${log.user.email})` : "Sistema (cron)"}
                    {log.detalhes && ` · ${log.detalhes}`}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-ink-muted">
                  {log.createdAt.toLocaleString("pt-BR")}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
