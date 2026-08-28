import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState } from "@/components/ui";
import { UsuarioForm } from "./usuario-form";
import { UsuarioCard } from "./usuario-card";

export default async function UsuariosPage() {
  const usuarioAtual = await requireUser();

  const usuarios = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, active: true, createdAt: true, lockedUntil: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Qualquer usuário ativo tem acesso completo — inclusive a cadastrar e substituir
          certificados digitais das empresas. Desative quem não deve mais ter acesso.
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
            <UsuarioCard key={usuario.id} usuario={usuario} souEu={usuario.id === usuarioAtual.id} />
          ))
        )}
      </div>
    </div>
  );
}
