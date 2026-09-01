"use client";

import { useState, useTransition } from "react";
import { gerarPdfsRetroativosAction } from "@/app/actions/pdfs";
import { Button } from "@/components/ui";

// Roda o backfill em lotes pequenos (ver src/app/actions/pdfs.ts), chamando
// a action repetidas vezes até não sobrar nada — dá pra processar centenas
// de notas com um clique só, sem esbarrar no limite de execução de uma
// função serverless.

export function GerarPdfsRetroativosButton({ pendentesInicial }: { pendentesInicial: number }) {
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
    startTransition(async () => {
      try {
        let seguir = true;
        while (seguir) {
          const resultado = await gerarPdfsRetroativosAction();
          setProcessadas(
            (p) => p + resultado.sucessoNfe + resultado.sucessoNfse
          );
          setFalhas(
            (f) =>
              f +
              (resultado.processadasNfe - resultado.sucessoNfe) +
              (resultado.processadasNfse - resultado.sucessoNfse)
          );
          setRestantes(resultado.restantes);
          seguir =
            resultado.restantes > 0 &&
            resultado.processadasNfe + resultado.processadasNfse > 0;
        }
        setConcluido(true);
      } catch (err) {
        setErro(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border p-4 text-sm">
      <p className="font-medium">PDFs retroativos</p>
      <p className="mt-1 text-xs text-ink-muted">
        Gera o DANFE/DANFSe em PDF e anexa no ClickUp pras notas coletadas antes desse recurso
        existir (ou que falharam ao anexar na hora). Notas que já têm o PDF não são reprocessadas.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={pending || restantes === 0} onClick={rodar}>
          {pending ? "Gerando..." : `Gerar PDFs (${restantes} pendente${restantes === 1 ? "" : "s"})`}
        </Button>
        {(processadas > 0 || falhas > 0) && (
          <p className="text-xs text-ink-muted">
            {processadas} gerado{processadas === 1 ? "" : "s"}
            {falhas > 0 && `, ${falhas} falha${falhas === 1 ? "" : "s"}`}
          </p>
        )}
      </div>
      {concluido && restantes === 0 && (
        <p className="mt-1 text-xs text-status-good">Concluído — nenhuma nota pendente.</p>
      )}
      {erro && <p className="mt-1 text-xs text-status-critical">{erro}</p>}
    </div>
  );
}
