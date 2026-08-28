import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { Card, EmptyState } from "@/components/ui";
import { UsuarioForm } from "./usuario-form";
import { UsuarioCard } from "./usuario-card";

export default async function UsuariosPage() {
  const usuarioAtual = await requireAdmin();

  const usuarios = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      role: true,
      createdAt: true,
      lockedUntil: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          <strong>Administrador</strong>: acesso completo, inclusive a cadastrar e substituir
          certificados digitais. <strong>Consulta</strong>: só visualiza — não mexe em nada.
          Desative quem não deve mais ter acesso.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink-secondary">Novo usuário</h2>
        <UsuarioForm />
      </Card>

      <div className="space-y-3">
        {usuarios.length === 0 ? (
          <EmptyState>Nenhum usuário cadastrado.</EmptyState>
        ) : (
          usuarios.map((usuario) => (
            <UsuarioCard
              key={usuario.id}
              usuario={{ ...usuario, role: usuario.role as "ADMIN" | "CONSULTA" }}
              souEu={usuario.id === usuarioAtual.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
