"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button, Card, FieldError, Input, Label } from "@/components/ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <Card className="space-y-3">
        <label className="block text-sm">
          <Label>E-mail</Label>
          <Input name="email" type="email" autoFocus required className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>Senha</Label>
          <Input name="password" type="password" required className="mt-1" />
        </label>
      </Card>

      <FieldError message={state?.error} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
