# Buscador NF CRM

App para coletar automaticamente as notas fiscais (NF-e) emitidas em nome de
vários CNPJs, direto da SEFAZ, e criar uma tarefa no ClickUp (lista **App
Coleta NF**, espaço **Contábil e Fiscal**) para cada nota coletada.

## Como funciona

- **Empresas (CNPJs)**: cada CNPJ que você quer monitorar é cadastrado em
  **Empresas**, junto com o certificado digital **A1** (arquivo `.pfx`/`.p12`
  e senha) daquele CNPJ — é esse certificado que autentica a consulta na
  SEFAZ (TLS mútuo) e assina a manifestação de ciência. O certificado e a
  senha ficam **cifrados em repouso** no banco (AES-256-GCM, chave em
  `ENCRYPTION_KEY`), nunca em texto claro.
- **Coleta automática**: a sincronização consulta o webservice nacional
  **NFeDistribuicaoDFe** da SEFAZ (Distribuição de DF-e — um único endpoint
  para o país todo, independente da UF do CNPJ) a partir do último NSU
  conhecido de cada empresa. Toda nota nova aparece primeiro como um
  **resumo** (resNFe); o app manifesta automaticamente a **Ciência da
  Operação** (evento 210200) para liberar o **XML completo** (procNFe), que
  fica disponível numa sincronização seguinte.
- **ClickUp**: assim que uma nota é vista pela primeira vez (resumo ou XML
  completo, o que chegar primeiro), o app cria **uma tarefa por nota** na
  lista "App Coleta NF" com emitente, CNPJ, número/série, valor e data —
  e anexa o XML completo à tarefa assim que ele fica disponível.
- **Sincronização**: roda automaticamente a cada hora via cron da Vercel
  (`vercel.json` → `/api/cron/sync`), ou manualmente pela tela
  **Sincronização** (todas as empresas) ou pelo botão "Sincronizar agora" em
  cada empresa.
- **Notas fiscais**: lista e filtra todas as notas coletadas, com o XML
  (resumo e/ou completo) disponível para download e link direto para a
  tarefa criada no ClickUp.
- **Acesso**: login próprio (e-mail/senha), independente de qualquer outro
  sistema — o primeiro acesso cria o usuário administrador em `/setup`.

## ⚠️ Sobre a integração com a SEFAZ

A integração com o webservice `NFeDistribuicaoDFe` e a assinatura da
manifestação de ciência (`src/lib/sefaz/`) foram implementadas seguindo a
especificação oficial (Nota Técnica 2014.002 e o schema XML da NF-e), mas
**não puderam ser testadas contra o ambiente real da SEFAZ** nesta primeira
versão — isso exige um certificado A1 válido de um CNPJ real, que não estava
disponível no momento da implementação. Antes de operar em produção:

1. Cadastre uma empresa com um certificado de teste e rode "Sincronizar
   agora" — acompanhe `lastSyncError` na tela de Empresas e os logs em
   Sincronização.
2. Se a SEFAZ retornar um erro de schema/SOAP, o texto de `xMotivo` ajuda a
   ajustar `src/lib/sefaz/client.ts` (consulta) ou
   `src/lib/sefaz/manifestacao.ts` (assinatura do evento) — os dois pontos
   mais sensíveis a pequenas divergências de especificação.
3. Certificados costumam expirar em 1 ano — a tela de Empresas mostra a
   validade e sinaliza quando um certificado está expirado.

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

## Publicando (ex: Vercel)

1. Importe o repositório na Vercel.
2. Crie um Postgres (aba Storage) — preenche `DATABASE_URL` automaticamente.
3. Em Settings → Environment Variables, adicione `SESSION_SECRET`,
   `ENCRYPTION_KEY`, `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID` e `CRON_SECRET`.
4. Deploy. O cron definido em `vercel.json` já roda a sincronização a cada
   hora automaticamente (recurso do plano da Vercel — confira se seu plano
   suporta crons horários).
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
