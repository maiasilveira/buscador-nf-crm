"use client";

import { useState, useTransition } from "react";
import {
  alternarAtivaEmpresaAction,
  excluirEmpresaAction,
} from "@/app/actions/empresas";
import { sincronizarEmpresaAction } from "@/app/actions/sync";
import { Button, Card } from "@/components/ui";
import { EmpresaEditForm } from "./empresa-edit-form";

type Empresa = {
  id: string;
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  uf: string;
  ambiente: string;
  active: boolean;
  certSubject: string | null;
  certValidUntil: Date | null;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  lastSyncNfseAt: Date | null;
  lastSyncNfseError: string | null;
  _count: { notas: number; notasServico: number };
};

export function EmpresaCard({ empresa, isAdmin }: { empresa: Empresa; isAdmin: boolean }) {
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const certExpirado = empresa.certValidUntil ? empresa.certValidUntil < new Date() : false;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {empresa.razaoSocial}{" "}
            {!empresa.active && (
              <span className="ml-1 text-xs font-normal text-ink-muted">(inativa)</span>
            )}
          </p>
          <p className="text-xs text-ink-muted">
            {empresa.cnpjFormatado} · {empresa.uf} ·{" "}
            {empresa.ambiente === "PRODUCAO" ? "Produção" : "Homologação"} ·{" "}
            {empresa._count.notas} NF-e · {empresa._count.notasServico} NFS-e
          </p>
          {empresa.certSubject && (
            <p className="mt-1 text-xs text-ink-muted">
              Certificado: {empresa.certSubject}
              {empresa.certValidUntil && (
                <span className={certExpirado ? "text-status-critical" : ""}>
                  {" "}
                  · válido até {empresa.certValidUntil.toLocaleDateString("pt-BR")}
                  {certExpirado ? " (expirado)" : ""}
                </span>
              )}
            </p>
          )}
          {empresa.lastSyncAt && (
            <p className="mt-1 text-xs text-ink-muted">
              Última sincronização NF-e: {empresa.lastSyncAt.toLocaleString("pt-BR")}
            </p>
          )}
          {empresa.lastSyncError && (
            <p className="mt-1 text-xs text-status-critical">Erro (NF-e): {empresa.lastSyncError}</p>
          )}
          {empresa.lastSyncNfseAt && (
            <p className="mt-1 text-xs text-ink-muted">
              Última sincronização NFS-e: {empresa.lastSyncNfseAt.toLocaleString("pt-BR")}
            </p>
          )}
          {empresa.lastSyncNfseError && (
            <p className="mt-1 text-xs text-status-critical">
              Erro (NFS-e): {empresa.lastSyncNfseError}
            </p>
          )}
          {erro && <p className="mt-1 text-xs text-status-critical">{erro}</p>}
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={pending || !empresa.active}
              onClick={() =>
                startTransition(async () => {
                  setErro(null);
                  try {
                    await sincronizarEmpresaAction(empresa.id);
                  } catch (err) {
                    setErro(err instanceof Error ? err.message : String(err));
                  }
                })
              }
            >
              Sincronizar agora
            </Button>
            <Button variant="secondary" onClick={() => setEditando((v) => !v)}>
              {editando ? "Fechar" : "Editar"}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => startTransition(() => alternarAtivaEmpresaAction(empresa.id))}
            >
              {empresa.active ? "Desativar" : "Ativar"}
            </Button>
            {empresa._count.notas === 0 && empresa._count.notasServico === 0 && (
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Excluir a empresa ${empresa.razaoSocial}?`)) {
                    startTransition(async () => {
                      setErro(null);
                      try {
                        await excluirEmpresaAction(empresa.id);
                      } catch (err) {
                        setErro(err instanceof Error ? err.message : String(err));
                      }
                    });
                  }
                }}
              >
                Excluir
              </Button>
            )}
          </div>
        )}
      </div>

      {isAdmin && editando && (
        <EmpresaEditForm empresa={empresa} onDone={() => setEditando(false)} />
      )}
    </Card>
  );
}
