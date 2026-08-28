"use client";

import { useActionState } from "react";
import {
  redefinirSenhaUsuarioAction,
  type RedefinirSenhaState,
} from "@/app/actions/usuarios";
import { Button, FieldError, FieldSuccess, Input, Label } from "@/components/ui";

export function RedefinirSenhaForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const action = redefinirSenhaUsuarioAction.bind(null, userId);
  const [state, formAction, pending] = useActionState<RedefinirSenhaState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <label className="block text-sm">
        <Label>Nova senha</Label>
        <Input name="novaSenha" type="password" required minLength={8} className="mt-1" />
      </label>
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Salvando..." : "Redefinir"}
      </Button>
      <Button type="button" variant="secondary" onClick={onDone}>
        Fechar
      </Button>
      <div className="w-full">
        <FieldError message={state?.error} />
        <FieldSuccess message={state?.ok ? "Senha redefinida." : undefined} />
      </div>
    </form>
  );
}
