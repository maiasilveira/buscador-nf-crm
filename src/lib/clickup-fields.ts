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
// ("Create List Field" / `POST /list/{list_id}/field`). Diferente da
// integração com a SEFAZ/NFS-e, a API do ClickUp é estável e bem
// documentada — a incerteza aqui é bem menor —, mas como não foi possível
// rodar o script de criação de fato nesta sessão (falta um token real),
// ainda vale conferir o resultado na lista antes de depender dele.

export type TipoCampoClickUp = "drop_down" | "text" | "currency" | "date";

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
  { name: "CNPJ Emitente/Prestador", type: "text" },
  { name: "Razão Social Emitente/Prestador", type: "text" },
  { name: "CNPJ da Empresa (destinatário/tomador)", type: "text" },
  { name: "Chave de Acesso", type: "text" },
  { name: "Número do Documento", type: "text" },
  { name: "Valor", type: "currency" },
  { name: "Data de Emissão", type: "date" },
  {
    name: "Status de Coleta",
    type: "drop_down",
    options: ["Resumo", "XML completo", "NFS-e"],
  },
];
