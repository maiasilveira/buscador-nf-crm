"use client";

import { useActionState } from "react";
import { criarEmpresaAction, type EmpresaFormState } from "@/app/actions/empresas";
import { Button, FieldError, Input, Label, Select } from "@/components/ui";
import { UF_LIST } from "@/lib/types";

export function EmpresaForm() {
  const [state, formAction, pending] = useActionState<EmpresaFormState, FormData>(
    criarEmpresaAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <Label>CNPJ</Label>
          <Input name="cnpj" required placeholder="00.000.000/0000-00" className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>Razão social</Label>
          <Input name="razaoSocial" required className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>UF</Label>
          <Select name="uf" required defaultValue="" className="mt-1">
            <option value="" disabled>
              Selecione
            </option>
            {UF_LIST.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          <Label>Ambiente</Label>
          <Select name="ambiente" defaultValue="PRODUCAO" className="mt-1">
            <option value="PRODUCAO">Produção</option>
            <option value="HOMOLOGACAO">Homologação</option>
          </Select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <Label>Certificado digital (.pfx / .p12)</Label>
          <Input name="certPfx" type="file" accept=".pfx,.p12" required className="mt-1" />
        </label>
        <label className="block text-sm">
          <Label>Senha do certificado</Label>
          <Input name="certPassword" type="password" required className="mt-1" />
        </label>
      </div>

      <FieldError message={state?.error} />

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Cadastrar empresa"}
      </Button>
    </form>
  );
}
