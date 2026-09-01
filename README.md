# Buscador NF CRM

App para coletar automaticamente as notas fiscais **recebidas** por vários
CNPJs (compras/contas a pagar — não as que eles emitem) e criar uma tarefa
no ClickUp (lista **App Coleta NF**, espaço **Contábil e Fiscal**) para
cada nota coletada.

## Cobertura: o que é "nota fiscal" aqui

No Brasil "nota fiscal" cobre vários documentos fiscais eletrônicos
diferentes, cada um com um sistema/webservice próprio. Cobertura atual:

| Tipo | O que é | Órgão | Status |
|---|---|---|---|
| **NF-e** (modelo 55) | Produtos/mercadorias | SEFAZ (estadual, webservice nacional único) | ✅ Coberto |
| **NFS-e** | Serviços | Sistema Nacional NFS-e (federal) | ⚠️ Coberto **parcialmente** — só municípios que já aderiram ao padrão nacional (veja abaixo) |
| **NFC-e** (modelo 65) | Consumidor final (varejo) | SEFAZ | ⚠️ Não filtrado explicitamente — pode aparecer misturado com NF-e se o CNPJ figurar como destinatário |
| **CT-e** (transporte), **MDF-e**, **NF3e** | Frete, manifesto de carga, energia | SEFAZ | ❌ Não coberto |

O app está pensado para o caso de **recebimento**: a empresa cadastrada é a
**destinatária** da NF-e ou a **tomadora** da NFS-e. Notas que essas
empresas **emitem** (vendas) não são o foco — o fluxo de manifestação de
ciência da NF-e, por exemplo, só faz sentido para quem recebe.

## Como funciona

- **Empresas (CNPJs)**: cada CNPJ que você quer monitorar é cadastrado em
  **Empresas**, junto com o certificado digital **A1** (arquivo `.pfx`/`.p12`
  e senha) daquele CNPJ — é esse certificado que autentica as consultas (TLS
  mútuo) e assina a manifestação de ciência da NF-e. O certificado e a senha
  ficam **cifrados em repouso** no banco (AES-256-GCM, chave em
  `ENCRYPTION_KEY`), nunca em texto claro.
- **Coleta de NF-e**: consulta o webservice nacional **NFeDistribuicaoDFe**
  da SEFAZ (Distribuição de DF-e — um único endpoint para o país todo,
  independente da UF do CNPJ) a partir do último NSU conhecido de cada
  empresa. Toda nota nova aparece primeiro como um **resumo** (resNFe); o
  app manifesta automaticamente a **Ciência da Operação** (evento 210200)
  para liberar o **XML completo** (procNFe), que fica disponível numa
  sincronização seguinte.
- **Coleta de NFS-e**: consulta o **Ambiente de Dados Nacional (ADN)** do
  Sistema Nacional NFS-e, com a mesma lógica de paginação por NSU — mas só
  retorna notas de municípios que já aderiram ao padrão nacional (veja a
  seção de aviso abaixo). Diferente da NF-e, o ADN já entrega o XML
  completo direto, sem etapa de manifestação.
- **ClickUp**: assim que uma nota é vista pela primeira vez, o app cria
  **uma tarefa por nota** na lista "App Coleta NF" — emitente/prestador,
  CNPJ, número, valor e data vão tanto na descrição da tarefa quanto em
  **campos customizados** (pra filtrar/agrupar/exportar a lista), e o XML é
  anexado assim que fica disponível. Veja "Campos customizados no ClickUp"
  abaixo pra provisionar esses campos.
- **Sincronização**: roda automaticamente todo dia via cron da Vercel
  (`vercel.json` → `/api/cron/sync`, NF-e e NFS-e juntas), ou manualmente
  pela tela **Sincronização** (todas as empresas) ou pelo botão
  "Sincronizar agora" em cada empresa.
- **Notas fiscais**: duas listas separadas — **NF-e** e **NFS-e** — com
  filtro por empresa, XML disponível para download e link direto para a
  tarefa criada no ClickUp.
- **Acesso**: login próprio (e-mail/senha), independente de qualquer outro
  sistema — o primeiro acesso cria o usuário **administrador** em `/setup`.
  Os demais usuários são adicionados em **Usuários** (só para
  administradores), com um de dois papéis:
  - **Administrador**: acesso completo — cadastra/edita/desativa/exclui
    empresa, cadastra e substitui certificado digital, dispara
    sincronização manual, gerencia usuários, vê a Auditoria.
  - **Consulta**: só visualiza — dashboard, notas (NF-e/NFS-e com XML e
    link do ClickUp), lista de empresas (sem os botões de ação) e os logs
    de sincronização. Sem acesso a Usuários nem Auditoria; qualquer
    tentativa direta é bloqueada tanto na tela quanto no servidor.

  Dá pra promover/rebaixar um usuário a qualquer momento, ativar/desativar
  (revoga acesso na hora, sem apagar histórico) e redefinir a senha de
  qualquer um — não há e-mail de convite nem "esqueci minha senha", é tudo
  combinado diretamente entre a equipe. O sistema nunca deixa desativar ou
  rebaixar o **último administrador ativo** — travaria o acesso
  administrativo de todo mundo. Login trava por 15 minutos depois de 5
  senhas erradas seguidas.
- **Auditoria** (só para administradores): todo evento sensível fica
  registrado — login (inclusive falhas e bloqueios), criação/edição/
  exclusão de empresa, substituição de certificado, usuários criados/
  ativados/desativados/promovidos, sincronizações disparadas (manual ou
  pelo cron). Nunca guarda senha, certificado ou qualquer outro segredo —
  só o evento e quem/quando.

## Sobre a integração com a SEFAZ (NF-e)

A integração com o webservice `NFeDistribuicaoDFe` e a assinatura da
manifestação de ciência (`src/lib/sefaz/`) foi implementada seguindo a
especificação oficial (Nota Técnica 2014.002 e o schema XML da NF-e) e
**já foi confirmada em produção**, com certificados A1 reais — a
autenticação TLS mútua e o envelope SOAP são aceitos pela SEFAZ.

Um ponto a saber, que já apareceu em produção: a SEFAZ retorna
**cStat 656 ("Consumo Indevido")** se a mesma empresa for consultada de
novo menos de 1h depois de uma resposta sem documentos novos — é uma
proteção da própria SEFAZ contra excesso de chamadas, não um erro do app.
O sistema já trata isso: guarda até quando esperar
(`Empresa.nfeBloqueadaAte`), desabilita o botão "Sincronizar agora"
mostrando quando libera, e nem tenta de novo (nem pelo cron, nem
manualmente) antes desse horário — pra não piorar o bloqueio. Isso tende a
acontecer mais com empresas recém-cadastradas, sincronizadas mais de uma
vez seguida antes de haver notas novas pra encontrar.

**Importante: esse bloqueio é por CNPJ na SEFAZ, não por aplicação.** Se
outro sistema também consulta a Distribuição DFe para o mesmo CNPJ — por
exemplo, um serviço pago de captura de notas contratado à parte pela
contabilidade (caso real já observado: **Qive**) — as chamadas dele contam
para o mesmo limite e podem manter a empresa bloqueada continuamente do
ponto de vista do `buscador-nf-crm`, mesmo respeitando 1h entre as
próprias tentativas. A mensagem de erro guardada em `lastSyncError`/no log
de sincronização inclui o texto original (`xMotivo`) devolvido pela SEFAZ
— útil para conferir se ele varia entre tentativas, o que reforça a
hipótese de disputa externa pelo mesmo CNPJ.

Não há como descobrir de fora o horário exato em que esse outro sistema
consulta. A estratégia adotada aqui, quando isso acontece, é **tentar com
mais frequência**: o workflow opcional
`.github/workflows/sync-nfe-frequente.yml` chama
`/api/cron/sync?apenas=nfe` a cada 10 minutos via GitHub Actions (o plano
Hobby da Vercel só permite 1 cron por dia — ver seção de deploy). Cada
tentativa é barata mesmo quando bloqueada: o app confere
`Empresa.nfeBloqueadaAte` antes de chamar a SEFAZ e pula sem gastar
requisição, então rodar com mais frequência não piora o bloqueio, só
aumenta a chance de uma tentativa cair numa janela livre. Para ativar,
cadastre o secret `CRON_SECRET` (mesmo valor da variável de ambiente na
Vercel) em Settings → Secrets and variables → Actions do repositório no
GitHub. O caminho mais confiável, porém, continua sendo perguntar
diretamente a quem administra o outro serviço (contabilidade/Qive) qual a
frequência/horário de consulta dele, para agendar a nossa fora dessa
janela.

Outros erros de schema/SOAP menos comuns: o texto de `xMotivo` (parte da
mensagem de erro) ajuda a ajustar `src/lib/sefaz/client.ts` (consulta) ou
`src/lib/sefaz/manifestacao.ts` (assinatura do evento) se aparecer algo
inesperado. Certificados costumam expirar em 1 ano — a tela de Empresas
mostra a validade e sinaliza quando um certificado está expirado.

## ⚠️⚠️ Sobre a integração com o Sistema Nacional NFS-e — leia antes de usar

Esta parte é **mais incerta** que a de NF-e, por dois motivos:

1. **Cobertura parcial por natureza**: o padrão nacional de NFS-e é recente
   (Convênio NFS-e / Ajuste SINIEF 00/2022) e depende de cada município ter
   migrado seu sistema próprio para o Ambiente de Dados Nacional (ADN).
   Municípios que ainda não migraram simplesmente **não aparecem** nessa
   consulta — não é um bug, é a fronteira atual da adoção do padrão. Se sua
   empresa recebe muitos serviços de municípios pequenos ou que ainda não
   aderiram, o `buscador-nf-crm` não vai enxergar essas notas.
2. **Endpoint/formato não validados**: a URL e o formato de resposta em
   `src/lib/nfse/client.ts` (`NFSE_ADN_BASE_URL`, hoje
   `https://adn.nfse.gov.br`) seguem o padrão publicamente descrito para o
   ADN (REST/JSON, mTLS com o certificado A1, paginação por NSU — o mesmo
   conceito da Distribuição DFe da NF-e), mas **não foram confirmados
   contra o manual de integração oficial vigente**, que não estava
   disponível nesta sessão. O mesmo vale para o parsing do XML da NFS-e em
   `src/lib/nfse/parse.ts` (estrutura `DPS`/`NFSe`).

Antes de operar em produção:

1. Confira o manual de integração atual em <https://www.gov.br/nfse> e
   ajuste a URL/formato em `src/lib/nfse/client.ts` se necessário — a URL
   base é configurável via `NFSE_ADN_BASE_URL` sem precisar mexer no código.
2. Rode "Sincronizar agora" numa empresa de teste e acompanhe
   `lastSyncNfseError` na tela de Empresas. Um erro do tipo "resposta não é
   JSON" ou "formato inesperado" é o sinal mais forte de que o endpoint ou
   o schema mudaram.
3. Se a cobertura parcial for um problema real pro seu caso (muitos
   prestadores em municípios ainda não aderidos), considere complementar
   com um provedor agregador pago (Focus NFe, PlugNotas, NFe.io) — eles já
   resolvem a fragmentação municipal, mas têm custo por CNPJ.

## Campos customizados no ClickUp

Além do texto na descrição da tarefa, cada nota preenche campos
customizados na lista "App Coleta NF" — dá pra filtrar, agrupar ou exportar
a lista por eles (ex: uma view agrupada por "Tipo de Documento", ou
ordenada por "Valor"). Catálogo completo em `src/lib/clickup-fields.ts`:

| Campo | Tipo | Preenchido com |
|---|---|---|
| Tipo de Documento | Dropdown (NF-e / NFS-e) | — |
| CNPJ Emitente/Prestador | Texto | quem emitiu a nota |
| Razão Social Emitente/Prestador | Texto | quem emitiu a nota |
| CNPJ da Empresa (destinatário/tomador) | Texto | a empresa cadastrada no app |
| Chave de Acesso | Texto | — |
| Número do Documento | Texto | número (+ série, na NF-e) |
| Valor | Moeda (BRL) | valor total / valor do serviço |
| Data de Emissão | Data | — |
| Status de Coleta | Dropdown (Resumo / XML completo / NFS-e) | só relevante pra NF-e |

**Esses campos precisam existir na lista antes de serem preenchidos.** Já
foram criados manualmente na lista "App Coleta NF" e conferidos contra o
catálogo (nomes e opções de dropdown batendo exatamente) — não precisa
fazer nada agora. Se precisar recriar algum campo no futuro (lista nova,
campo apagado por engano), tem duas formas:

- Manualmente na UI do ClickUp, seguindo a tabela acima à risca (nome
  exato, incluindo acentos/parênteses — é por esse nome que o app resolve
  o campo).
- Ou rode o script (precisa de `CLICKUP_API_TOKEN` e `CLICKUP_LIST_ID` no
  `.env`, e rodar de uma máquina com acesso à internet):

  ```bash
  npm run clickup:setup-fields
  ```

  É idempotente — roda de novo sem duplicar o que já existe, então só cria
  o que estiver faltando.

Um campo que não existe na lista (renomeado, apagado, ou catálogo
desatualizado) é simplesmente ignorado na hora de preencher a tarefa —
nunca impede a nota de ser coletada.

## PDF (DANFE / DANFSe)

Além do XML, o app gera um PDF a partir de cada nota — DANFE pra NF-e,
DANFSe pra NFS-e — e anexa automaticamente na tarefa do ClickUp junto com
o XML completo (`src/lib/pdf/danfe.ts`, `src/lib/pdf/danfse.ts`, geração
com `pdfkit` + código de barras Code128 via `bwip-js` + QR code via
`qrcode`, tudo puro JS sem dependência nativa — compatível com o runtime
serverless da Vercel). Também dá pra baixar manualmente pela tela da nota
(`/notas/:id` e `/notas-servico/:id`) ou direto pelas rotas
`/api/notas/:id/pdf` e `/api/notas-servico/:id/pdf`.

**Importante sobre fidelidade ao layout oficial:**

- O PDF reproduz a **estrutura e o conteúdo completo** do DANFE/DANFSe
  oficial (canhoto, dados do emitente/destinatário, itens, impostos,
  transporte, código de barras da chave de acesso no DANFE, QR code no
  DANFSe) — mas **não é uma réplica pixel-a-pixel** do leiaute regulamentar
  (posições/medidas exatas em mm do Manual de Orientação do Contribuinte).
  Serve como comprovante/registro interno para a contabilidade; não
  substitui o DANFE emitido pelo sistema de origem quando a forma impressa
  oficial for exigida (ex: acompanhar mercadoria em trânsito).
- **DANFE (NF-e)** só fica disponível depois do XML completo (procNFe) —
  o resumo (resNFe) não traz itens nem impostos, então não dá pra montar
  o documento a partir dele. O botão/anexo aparece só depois da
  manifestação de ciência ser processada.
- **DANFSe (NFS-e)**: mesmo caveat da seção anterior sobre a estrutura do
  XML nacional não ter sido validada contra um documento real — os campos
  usam fallbacks defensivos, mas alguns podem vir vazios até essa
  confirmação. O QR code codifica a chave de acesso (não uma URL de
  consulta pública — o formato exato dessa URL no Ambiente de Dados
  Nacional não foi confirmado).
- Geração é *best-effort*: uma falha ao montar o PDF (campo inesperado no
  XML) nunca derruba a sincronização nem a tarefa/nota já criada — só fica
  sem o anexo de PDF (o XML continua disponível normalmente). Erros vão
  pro log do servidor.

**Notas coletadas antes desse recurso existir** (ou cujo anexo falhou na
hora) não ganham o PDF retroativamente sozinhas — a sincronização só
processa documentos novos. Pra essas, tem um botão **"Gerar PDFs
(N pendentes)"** na tela de Sincronização (só ADMIN), que roda em lotes
pequenos até não sobrar nenhuma (`src/app/actions/pdfs.ts`,
`gerarPdfsRetroativosAction`). O campo `pdfAnexado` no banco marca quais
notas já têm o PDF, pra não gerar/anexar duplicado numa próxima rodada.

## Rodando localmente

Pré-requisitos: Node.js 20+ e um banco Postgres acessível.

```bash
npm install
cp .env.example .env   # edite DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY

npx prisma migrate dev

npm run dev
```

Abra http://localhost:3000 — a primeira visita leva para `/setup`, onde você
cria o usuário administrador.

## Variáveis de ambiente

Veja `.env.example`. Resumo:

- `DATABASE_URL`: connection string do Postgres.
- `SESSION_SECRET`: segredo do cookie de sessão (`openssl rand -hex 32`).
- `ENCRYPTION_KEY`: chave de 32 bytes em hex para cifrar certificado/senha
  das empresas em repouso (`openssl rand -hex 32`).
- `CLICKUP_API_TOKEN`: token de API do ClickUp (Configurações → Apps).
- `CLICKUP_LIST_ID`: id da lista "App Coleta NF" (já preenchido com
  `901716420520`, o id atual — confirme se a lista mudar de workspace).
- `CRON_SECRET` (opcional): protege `/api/cron/sync` contra chamadas
  externas não autorizadas.
- `NFSE_ADN_BASE_URL` (opcional): URL base do Ambiente de Dados Nacional do
  Sistema Nacional NFS-e — veja o aviso acima antes de contar com ela.

## Publicando (ex: Vercel)

1. Importe o repositório na Vercel.
2. Crie um Postgres (aba Storage) — preenche `DATABASE_URL` automaticamente.
3. Em Settings → Environment Variables, adicione `SESSION_SECRET`,
   `ENCRYPTION_KEY`, `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID` e `CRON_SECRET`.
4. Deploy. O cron definido em `vercel.json` já roda a sincronização (NF-e e
   NFS-e) automaticamente todo dia — plano Hobby da Vercel só permite crons
   diários; se seu plano suportar mais frequência, ajuste o `schedule`.
5. Depois do primeiro deploy, rode as migrações contra o banco de produção:
   `npx prisma migrate deploy` com a `DATABASE_URL` de produção.
6. Acesse a URL gerada — ela leva para `/setup` para criar o usuário
   administrador.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Server Actions) + TypeScript
- [Tailwind CSS](https://tailwindcss.com) v4
- [Prisma](https://www.prisma.io) + Postgres (via `@prisma/adapter-pg`)
- Sessão própria via cookie assinado (HMAC) + senha com hash bcrypt
- `node-forge` (leitura do certificado `.pfx`) e `xml-crypto` (assinatura
  XML-DSig da manifestação de ciência) para a integração com a SEFAZ
- Integração com a API v2 do [ClickUp](https://clickup.com)

## Scripts

```bash
npm run dev      # ambiente de desenvolvimento
npm run build    # build de produção
npm run start    # roda o build de produção
npm run lint     # eslint
npx prisma studio  # explorar/editar o banco visualmente
```
