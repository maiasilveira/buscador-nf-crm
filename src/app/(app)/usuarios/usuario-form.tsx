"use client";

import { useActionState } from "react";
import { criarUsuarioAction, type UsuarioFormState } from "@/app/actions/usuarios";
import { Button, FieldError, Input, Label, Select } from "@/components/ui";

export function UsuarioForm() {
  const [state, formAction, pending] = useActionState<UsuarioFormState, FormData>(
    criarUsuarioAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <Label>Nome</Label>
          <Input name="name" required className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>E-mail</Label>
          <Input name="email" type="email" required className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>Senha inicial (mínimo 8 caracteres)</Label>
          <Input name="password" type="password" required minLength={8} className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>Papel</Label>
          <Select name="role" defaultValue="CONSULTA" className="mt-1">
            <option value="CONSULTA">Consulta (só visualiza)</option>
            <option value="ADMIN">Administrador (acesso completo)</option>
          </Select>
        </label>
      </div>

      <FieldError message={state?.error} />

      <p className="text-xs text-ink-muted">
        Não há e-mail de convite — combine o e-mail e a senha diretamente com a pessoa.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Adicionar usuário"}
      </Button>
    </form>
  );
}
