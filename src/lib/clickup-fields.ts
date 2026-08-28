// Catálogo dos campos customizados que o Buscador NF CRM espera encontrar
// na lista "App Coleta NF" do ClickUp. Fonte única usada tanto pelo script
// de provisionamento (`scripts/setup-clickup-fields.ts`) quanto pela
// aplicação em tempo de execução (`src/lib/clickup.ts`) — os nomes aqui
// são o "contrato": a aplicação resolve o id de cada campo pelo nome, então
// renomear um campo na lista do ClickUp sem atualizar aqui (ou vice-versa)
// faz esse campo específico parar de ser preenchido (silenciosamente — veja
// o comportamento não-bloqueante em src/lib/clickup.ts).
//
// Os tipos e o formato de `type_config` seguem a API v2 do ClickUp
// ("Create List Field" / `POST /list/{list_id}/field`). Os 9 campos abaixo
// foram criados manualmente na lista real e conferidos via
// clickup_get_custom_fields — nomes e opções batem exatamente. Uma
// diferença encontrada nessa conferência: o campo "Texto" da UI do ClickUp
// vira o tipo `short_text` na API (não `text`) — corrigido abaixo.

export type TipoCampoClickUp = "drop_down" | "short_text" | "currency" | "date";

export type CampoClickUp = {
  /** Nome exibido na lista do ClickUp — é por esse nome que a aplicação
   * encontra o campo em tempo de execução (case-insensitive). */
  name: string;
  type: TipoCampoClickUp;
  /** Só usado por campos "drop_down": rótulos das opções (o ClickUp gera o
   * id/UUID de cada opção na criação — a aplicação resolve por nome). */
  options?: string[];
};

export const CAMPOS_CLICKUP: CampoClickUp[] = [
  { name: "Tipo de Documento", type: "drop_down", options: ["NF-e", "NFS-e"] },
  { name: "CNPJ Emitente/Prestador", type: "short_text" },
  { name: "Razão Social Emitente/Prestador", type: "short_text" },
  { name: "CNPJ da Empresa (destinatário/tomador)", type: "short_text" },
  { name: "Chave de Acesso", type: "short_text" },
  { name: "Número do Documento", type: "short_text" },
  { name: "Valor", type: "currency" },
  { name: "Data de Emissão", type: "date" },
  {
    name: "Status de Coleta",
    type: "drop_down",
    options: ["Resumo", "XML completo", "NFS-e"],
  },
];
