"use client";

import { useState, useTransition } from "react";
import { alternarAtivoUsuarioAction, alterarPapelUsuarioAction } from "@/app/actions/usuarios";
import { Button, Card } from "@/components/ui";
import { RedefinirSenhaForm } from "./redefinir-senha-form";

type Usuario = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: "ADMIN" | "CONSULTA";
  createdAt: Date;
  lockedUntil: Date | null;
};

export function UsuarioCard({ usuario, souEu }: { usuario: Usuario; souEu: boolean }) {
  const [redefinindo, setRedefinindo] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const bloqueado = usuario.lockedUntil ? usuario.lockedUntil > new Date() : false;

  function rodar(acao: () => Promise<void>) {
    setErro(null);
    startTransition(async () => {
      try {
        await acao();
      } catch (err) {
        setErro(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {usuario.name} {souEu && <span className="text-xs font-normal text-ink-muted">(você)</span>}{" "}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                usuario.role === "ADMIN"
                  ? "bg-accent/15 text-accent"
                  : "bg-black/5 text-ink-secondary"
              }`}
            >
              {usuario.role === "ADMIN" ? "Administrador" : "Consulta"}
            </span>
            {!usuario.active && (
              <span className="ml-1 text-xs font-normal text-ink-muted">(inativo)</span>
            )}
            {bloqueado && (
              <span className="ml-1 text-xs font-normal text-status-critical">
                (bloqueado temporariamente por tentativas de login)
              </span>
            )}
          </p>
          <p className="text-xs text-ink-muted">
            {usuario.email} · desde {usuario.createdAt.toLocaleDateString("pt-BR")}
          </p>
          {erro && <p className="mt-1 text-xs text-status-critical">{erro}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRedefinindo((v) => !v)}>
            {redefinindo ? "Fechar" : "Redefinir senha"}
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              rodar(() =>
                alterarPapelUsuarioAction(usuario.id, usuario.role === "ADMIN" ? "CONSULTA" : "ADMIN")
              )
            }
          >
            {usuario.role === "ADMIN" ? "Tornar consulta" : "Tornar administrador"}
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => rodar(() => alternarAtivoUsuarioAction(usuario.id))}
          >
            {usuario.active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      </div>

      {redefinindo && (
        <RedefinirSenhaForm userId={usuario.id} onDone={() => setRedefinindo(false)} />
      )}
    </Card>
  );
}
