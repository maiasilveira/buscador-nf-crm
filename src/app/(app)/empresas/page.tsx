import { prisma } from "@/lib/prisma";
import { Card, EmptyState } from "@/components/ui";
import { formatCnpj } from "@/lib/cnpj";
import { EmpresaForm } from "./empresa-form";
import { EmpresaCard } from "./empresa-card";

export default async function EmpresasPage() {
  const empresas = await prisma.empresa.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      uf: true,
      ambiente: true,
      active: true,
      certSubject: true,
      certValidUntil: true,
      lastSyncAt: true,
      lastSyncError: true,
      _count: { select: { notas: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Empresas (CNPJs)</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Cada empresa precisa de um certificado digital A1 (.pfx) válido para a
          coleta automática na SEFAZ funcionar.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink-secondary">Nova empresa</h2>
        <EmpresaForm />
      </Card>

      <div className="space-y-3">
        {empresas.length === 0 ? (
          <EmptyState>Nenhuma empresa cadastrada ainda.</EmptyState>
        ) : (
          empresas.map((empresa) => (
            <EmpresaCard
              key={empresa.id}
              empresa={{ ...empresa, cnpjFormatado: formatCnpj(empresa.cnpj) }}
            />
          ))
        )}
      </div>
    </div>
  );
}
