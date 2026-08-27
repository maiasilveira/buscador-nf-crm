import { NextRequest, NextResponse } from "next/server";
import { sincronizarTodasEmpresas } from "@/lib/sefaz/sync";

// Chamado pelo cron da Vercel (veja vercel.json) — protegido por um segredo
// simples para que só o cron (ou alguém que conheça o segredo) consiga
// disparar a sincronização por HTTP.
//
// A Vercel envia o header `Authorization: Bearer ${CRON_SECRET}` automaticamente
// quando CRON_SECRET está configurado nas variáveis de ambiente do projeto.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  const resultados = await sincronizarTodasEmpresas();
  return NextResponse.json({ resultados });
}
