import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const current = await getCurrentUser();
  if (current) {
    redirect("/");
  }

  const totalUsers = await prisma.user.count();
  if (totalUsers === 0) {
    redirect("/setup");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Buscador NF CRM</h1>
          <p className="mt-2 text-sm text-ink-secondary">Entre com seu e-mail e senha.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
