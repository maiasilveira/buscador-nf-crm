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
  **uma tarefa por nota** na lista "App Coleta NF" (emitente/prestador,
  CNPJ, número, valor, data) e anexa o XML assim que ele fica disponível.
- **Sincronização**: roda automaticamente todo dia via cron da Vercel
  (`vercel.json` → `/api/cron/sync`, NF-e e NFS-e juntas), ou manualmente
  pela tela **Sincronização** (todas as empresas) ou pelo botão
  "Sincronizar agora" em cada empresa.
- **Notas fiscais**: duas listas separadas — **NF-e** e **NFS-e** — com
  filtro por empresa, XML disponível para download e link direto para a
  tarefa criada no ClickUp.
- **Acesso**: login próprio (e-mail/senha), independente de qualquer outro
  sistema — o primeiro acesso cria o usuário administrador em `/setup`.

## ⚠️ Sobre a integração com a SEFAZ (NF-e)

A integração com o webservice `NFeDistribuicaoDFe` e a assinatura da
manifestação de ciência (`src/lib/sefaz/`) foram implementadas seguindo a
especificação oficial (Nota Técnica 2014.002 e o schema XML da NF-e), mas
**não puderam ser testadas contra o ambiente real da SEFAZ** — isso exige
um certificado A1 válido de um CNPJ real, que não estava disponível no
momento da implementação. Antes de operar em produção:

1. Cadastre uma empresa com um certificado de teste e rode "Sincronizar
   agora" — acompanhe `lastSyncError` na tela de Empresas e os logs em
   Sincronização.
2. Se a SEFAZ retornar um erro de schema/SOAP, o texto de `xMotivo` ajuda a
   ajustar `src/lib/sefaz/client.ts` (consulta) ou
   `src/lib/sefaz/manifestacao.ts` (assinatura do evento) — os dois pontos
   mais sensíveis a pequenas divergências de especificação.
3. Certificados costumam expirar em 1 ano — a tela de Empresas mostra a
   validade e sinaliza quando um certificado está expirado.

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
