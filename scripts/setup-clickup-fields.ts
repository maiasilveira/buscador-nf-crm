import "dotenv/config";
import { CAMPOS_CLICKUP } from "../src/lib/clickup-fields";

// Cria (uma vez) os campos customizados esperados na lista "App Coleta NF"
// do ClickUp — veja src/lib/clickup-fields.ts pro catálogo. Idempotente:
// pula qualquer campo cujo nome já exista na lista, então rodar de novo
// depois de editar o catálogo só cria o que estiver faltando.
//
// Uso:
//   npm run clickup:setup-fields
//
// Requer no .env: CLICKUP_API_TOKEN e CLICKUP_LIST_ID (os mesmos que a
// aplicação usa para criar as tarefas).

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function apiToken(): string {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN não configurado no .env.");
  return token;
}

function listId(): string {
  const id = process.env.CLICKUP_LIST_ID;
  if (!id) throw new Error("CLICKUP_LIST_ID não configurado no .env.");
  return id;
}

async function listarCamposExistentes(): Promise<Set<string>> {
  const res = await fetch(`${CLICKUP_API_BASE}/list/${listId()}/field`, {
    headers: { Authorization: apiToken() },
  });
  if (!res.ok) {
    throw new Error(`Falha ao listar campos existentes (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { fields: { name: string }[] };
  return new Set(data.fields.map((f) => f.name.trim().toLowerCase()));
}

async function criarCampo(campo: (typeof CAMPOS_CLICKUP)[number]): Promise<void> {
  const type_config =
    campo.type === "drop_down"
      ? { options: (campo.options ?? []).map((name) => ({ name })) }
      : campo.type === "currency"
        ? { currency_type: "BRL" }
        : {};

  const res = await fetch(`${CLICKUP_API_BASE}/list/${listId()}/field`, {
    method: "POST",
    headers: { Authorization: apiToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: campo.name, type: campo.type, type_config }),
  });

  if (!res.ok) {
    console.error(`  ✗ "${campo.name}" — falha (${res.status}): ${await res.text()}`);
    return;
  }

  const created = (await res.json()) as { id: string };
  console.log(`  ✓ "${campo.name}" criado (id: ${created.id})`);
}

async function main() {
  console.log(`Verificando campos existentes na lista ${listId()}...`);
  const existentes = await listarCamposExistentes();

  for (const campo of CAMPOS_CLICKUP) {
    if (existentes.has(campo.name.trim().toLowerCase())) {
      console.log(`  = "${campo.name}" já existe, pulando.`);
      continue;
    }
    await criarCampo(campo);
  }

  console.log(
    "\nPronto. A aplicação resolve os campos pelo nome em tempo de execução — não precisa " +
      "copiar ids pra lugar nenhum. Se algum campo falhou, confira o tipo/formato em " +
      "src/lib/clickup-fields.ts contra a documentação atual da API do ClickUp " +
      "(https://developer.clickup.com/reference/createfield)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
