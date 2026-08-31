import { NextRequest, NextResponse } from "next/server";
import { sincronizarTodasEmpresas } from "@/lib/sefaz/sync";
import { sincronizarNfseTodasEmpresas } from "@/lib/nfse/sync";
import { registrarAuditoria } from "@/lib/audit";

// Chamado pelo cron da Vercel (veja vercel.json) e, opcionalmente, por um
// segundo agendador externo (ex.: GitHub Actions) que dispara com mais
// frequência só a parte de NF-e — protegido por um segredo simples para que
// só o cron (ou alguém que conheça o segredo) consiga disparar a
// sincronização por HTTP.
//
// A Vercel envia o header `Authorization: Bearer ${CRON_SECRET}` automaticamente
// quando CRON_SECRET está configurado nas variáveis de ambiente do projeto.
//
// Parâmetro opcional `?apenas=nfe`: roda só a sincronização de NF-e, pulando
// a de NFS-e. Existe porque a NF-e (SEFAZ) pode sofrer bloqueio por
// "Consumo Indevido" (cStat 656) quando outro sistema também consulta o
// mesmo CNPJ (ex.: um serviço de captura contratado à parte) — nesse
// cenário, tentar com mais frequência aumenta a chance de encontrar uma
// janela livre, mas não faz sentido repetir a NFS-e (que nunca teve esse
// problema) na mesma cadência.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  const apenas = request.nextUrl.searchParams.get("apenas");

  await registrarAuditoria({ userId: null, action: "SYNC_DISPARADA_CRON" });

  const resultadosNfe = await sincronizarTodasEmpresas();
  if (apenas === "nfe") {
    return NextResponse.json({ resultadosNfe });
  }

  const resultadosNfse = await sincronizarNfseTodasEmpresas();
  return NextResponse.json({ resultadosNfe, resultadosNfse });
}
