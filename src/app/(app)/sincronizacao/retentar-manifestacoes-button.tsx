"use client";

import { useState, useTransition } from "react";
import { retentarManifestacoesAction } from "@/app/actions/manifestacao";
import { Button } from "@/components/ui";

// Roda o backfill em lotes pequenos (ver src/app/actions/manifestacao.ts),
// paginando por cursor até varrer todas as notas presas em "Resumo" uma vez
// — diferente do backfill de PDF, uma manifestação aceita não zera
// `restantes` na hora (só a próxima sincronização normal completa a nota),
// então o loop para quando a varredura chega ao fim (proximoCursor nulo),
// não quando `restantes` chega a 0.

export function RetentarManifestacoesButton({ pendentesInicial }: { pendentesInicial: number }) {
  const [pending, startTransition] = useTransition();
  const [restantes, setRestantes] = useState(pendentesInicial);
  const [processadas, setProcessadas] = useState(0);
  const [falhas, setFalhas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  if (pendentesInicial === 0 && !concluido) return null;

  async function rodar() {
    setErro(null);
    setConcluido(false);
    setProcessadas(0);
    setFalhas(0);
    startTransition(async () => {
      try {
        let cursor: string | undefined;
        let seguir = true;
        while (seguir) {
          const resultado = await retentarManifestacoesAction(cursor);
          setProcessadas((p) => p + resultado.sucesso);
          setFalhas((f) => f + (resultado.processadas - resultado.sucesso));
          setRestantes(resultado.restantes);
          cursor = resultado.proximoCursor ?? undefined;
          seguir = resultado.proximoCursor !== null;
        }
        setConcluido(true);
      } catch (err) {
        setErro(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border p-4 text-sm">
      <p className="font-medium">Manifestações pendentes</p>
      <p className="mt-1 text-xs text-ink-muted">
        Reenvia a manifestação de ciência pras NF-e presas em &quot;Resumo&quot; (XML completo nunca
        liberado pela SEFAZ) — pode ter falhado na hora, ou nunca ter sido tentada. Uma
        manifestação aceita não completa a nota na hora — isso acontece na próxima sincronização
        normal. Se continuar falhando, o motivo aparece em &quot;Manifestação&quot; na página da
        nota.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={pending || restantes === 0} onClick={rodar}>
          {pending
            ? "Retentando..."
            : `Retentar manifestações (${restantes} presa${restantes === 1 ? "" : "s"} em Resumo)`}
        </Button>
        {(processadas > 0 || falhas > 0) && (
          <p className="text-xs text-ink-muted">
            {processadas} aceita{processadas === 1 ? "" : "s"}
            {falhas > 0 && `, ${falhas} ainda rejeitada${falhas === 1 ? "" : "s"}`}
          </p>
        )}
      </div>
      {concluido && (
        <p className="mt-1 text-xs text-status-good">
          Varredura concluída — {processadas} manifestaç{processadas === 1 ? "ão" : "ões"} aceita
          {processadas === 1 ? "" : "s"} nessa rodada. Elas saem de &quot;Resumo&quot; na próxima
          sincronização normal.
        </p>
      )}
      {erro && <p className="mt-1 text-xs text-status-critical">{erro}</p>}
    </div>
  );
}
