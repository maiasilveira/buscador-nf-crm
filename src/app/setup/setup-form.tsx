"use client";

import { useActionState } from "react";
import { setupAdminAction, type SetupState } from "@/app/actions/auth";
import { Button, Card, FieldError, Input, Label } from "@/components/ui";

export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(
    setupAdminAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <Card className="space-y-3">
        <label className="block text-sm">
          <Label>Seu nome</Label>
          <Input name="name" required placeholder="Ex: Maia Silveira" className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>E-mail</Label>
          <Input name="email" type="email" required placeholder="voce@empresa.com" className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>Senha (mínimo 8 caracteres)</Label>
          <Input name="password" type="password" required minLength={8} className="mt-1" />
        </label>
      </Card>

      <FieldError message={state?.error} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar administrador e continuar"}
      </Button>
    </form>
  );
}
