"use client";

import { useActionState } from "react";
import { atualizarEmpresaAction, type EmpresaFormState } from "@/app/actions/empresas";
import { Button, FieldError, Input, Label, Select } from "@/components/ui";
import { UF_LIST } from "@/lib/types";

type Empresa = {
  id: string;
  razaoSocial: string;
  uf: string;
  ambiente: string;
};

export function EmpresaEditForm({ empresa, onDone }: { empresa: Empresa; onDone: () => void }) {
  const action = atualizarEmpresaAction.bind(null, empresa.id);
  const [state, formAction, pending] = useActionState<EmpresaFormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-3 border-t border-border pt-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <Label>Razão social</Label>
          <Input name="razaoSocial" required defaultValue={empresa.razaoSocial} className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>UF</Label>
          <Select name="uf" required defaultValue={empresa.uf} className="mt-1">
            {UF_LIST.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          <Label>Ambiente</Label>
          <Select name="ambiente" defaultValue={empresa.ambiente} className="mt-1">
            <option value="PRODUCAO">Produção</option>
            <option value="HOMOLOGACAO">Homologação</option>
          </Select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <Label>Trocar certificado (.pfx / .p12) — opcional</Label>
          <Input name="certPfx" type="file" accept=".pfx,.p12" className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>Senha do novo certificado</Label>
          <Input name="certPassword" type="password" className="mt-1" />
        </label>
      </div>

      <FieldError message={state?.error} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
