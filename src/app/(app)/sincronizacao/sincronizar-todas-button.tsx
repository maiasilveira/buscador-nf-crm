"use client";

import { useState, useTransition } from "react";
import { sincronizarTodasAction } from "@/app/actions/sync";
import { Button } from "@/components/ui";

export function SincronizarTodasButton() {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            try {
              await sincronizarTodasAction();
            } catch (err) {
              setErro(err instanceof Error ? err.message : String(err));
            }
          })
        }
      >
        {pending ? "Sincronizando..." : "Sincronizar todas agora"}
      </Button>
      {erro && <p className="mt-1 text-xs text-status-critical">{erro}</p>}
    </div>
  );
}
