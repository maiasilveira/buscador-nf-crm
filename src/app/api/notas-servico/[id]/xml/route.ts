import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const nota = await prisma.notaServico.findUnique({
    where: { id },
    select: { chaveAcesso: true, xmlCompleto: true },
  });
  if (!nota) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  return new NextResponse(nota.xmlCompleto, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nota.chaveAcesso || id}.xml"`,
    },
  });
}
