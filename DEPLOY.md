# Publicar o match.IA (checklist)

Um único serviço Node hospeda a API **e** o site (mesmo processo, mesma porta,
ver `backend/src/server.js`). O código já está pronto para produção; falta criar
as contas (grátis) nos serviços e conectar. Esses passos exigem login em contas
que só vocês têm — sigam na ordem.

## 1. Banco de dados: MongoDB Atlas (grátis)

1. Crie uma conta em https://www.mongodb.com/cloud/atlas/register.
2. Crie um cluster gratuito (M0).
3. Em **Database Access**, crie um usuário com senha.
4. Em **Network Access**, libere `0.0.0.0/0` (qualquer IP). O Render não tem IP
   fixo no plano grátis; sem isso o servidor publicado não conecta.
5. Em **Connect → Drivers**, copie a *connection string*
   (`mongodb+srv://usuario:senha@cluster.../matchia`).

> O cluster do projeto é o **`cluster0.etccwhv.mongodb.net`** (usuário
> `natanaelmgs04_db_user`). A string de produção fica assim — troque `SENHA` e
> mantenha o `/matchia` (sem ele os dados vão para um banco chamado `test`):
> `mongodb+srv://natanaelmgs04_db_user:SENHA@cluster0.etccwhv.mongodb.net/matchia?retryWrites=true&w=majority&appName=Cluster0`
> Senha com `@`, `:`, `/`, `#` ou `%` precisa ser codificada (ex.: `@` → `%40`).
>
> No computador de desenvolvimento, o `backend/KEYS.env` aponta para um MongoDB
> **local** (`mongodb://127.0.0.1:27017/matchia`) — as contas de teste criadas
> aqui **não** estão no Atlas. Produção começa com o banco do Atlas.

## 2. Código no GitHub

Já está — https://github.com/natanaelmgs04/TCC---MatchAI. Qualquer alteração
nova: commit e push na branch `main` (o Render publica sozinho a cada push).

**Atenção**: `backend/KEYS.env` está no `.gitignore` — as chaves nunca vão para
o GitHub. Os nomes das variáveis estão em `backend/KEYS.env.example`.

## 3. Hospedagem: Render (grátis)

1. Crie uma conta em https://render.com (dá para entrar com o GitHub).
2. **New → Blueprint** → selecione o repositório. O Render lê o `render.yaml`
   da raiz, que já está pronto (Node 22, `NODE_ENV=production`, health check).
3. Preencha as variáveis que ele pedir:
   - `MONGODB_URI`: a connection string do Atlas (passo 1).
   - `GEMINI_API_KEY`: a mesma do seu `backend/KEYS.env` local (Match e chatbot).
   - `UNSPLASH_ACCESS_KEY`: idem (opcional — referências visuais dos arquitetos).
   - `BREVO_API_KEY` e `EMAIL_FROM`: e-mail de verdade (passo 4). Sem elas, o
     site funciona e os e-mails só aparecem no log do Render.
   - `JWT_SECRET`: o Render gera sozinho.
   - `ADMIN_EMAILS`: e-mails da equipe que entram no painel de gestão
     (`/admin.html`), separados por vírgula. **Nunca** coloque a conta demo aqui.
4. A URL pública (algo como `https://matchia.onrender.com`) já serve o site
   inteiro. `assets/js/api.js` usa o caminho relativo `/api`, que funciona em
   qualquer domínio.
5. Banco novo vazio? Rode **só o seed de materiais** uma vez contra o Atlas,
   do seu computador, dentro de `backend/`:
   `MONGODB_URI="mongodb+srv://…/matchia" npm run seed:materials`
   (ou troque temporariamente o `MONGODB_URI` no `backend/KEYS.env` e volte
   depois). `seed:architects` e `seed:demo` criam contas de demonstração com
   senha pública — use só se for apresentar, e exclua-as depois pelo painel.

   > O plano grátis do Render "dorme" depois de ~15 minutos sem uso; a primeira
   > visita depois disso leva ~30–50 s para acordar. Antes de uma apresentação,
   > abram o site uns minutos antes.

## 4. E-mail: Brevo (grátis, 300 e-mails/dia)

O plano grátis do Render **bloqueia SMTP** (portas 25, 465 e 587), então Gmail
direto não funciona lá. O servidor envia pela API HTTP da Brevo, que passa.

1. Crie uma conta em https://www.brevo.com (plano Free).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: use o e-mail
   que vai aparecer como remetente (pode ser um Gmail do grupo) e confirme pelo
   link que chega nele.
3. **SMTP & API → API Keys → Generate a new API key**. Copie a chave (ela só
   aparece uma vez).
4. No Render, em **Environment**, preencha:
   - `BREVO_API_KEY` = a chave do passo 3
   - `EMAIL_FROM` = `match.IA <o-email-do-passo-2>`
5. Salve (o Render reinicia sozinho). No log deve aparecer
   `E-mail: Brevo (API HTTP)`.
6. Teste: crie uma conta com um e-mail seu (chega o de boas-vindas) e use
   "Esqueci minha senha" no login.

> Remetente @gmail.com sem domínio próprio pode cair no **spam** nas primeiras
> vezes — peça para marcar "não é spam". Os links dos e-mails usam o endereço
> público do Render (`RENDER_EXTERNAL_URL`, automático); com domínio próprio,
> defina `APP_URL=https://seu-dominio`.

E-mails que o site envia: boas-vindas, redefinição de senha, nova mensagem no
chat, pedido/aceite/recusa/cancelamento de contratação, avaliação recebida e
CAU verificado.

## 5. Painel da equipe (`/admin.html`)

1. No Render, preencha `ADMIN_EMAILS` com os e-mails da equipe
   (ex.: `voce@gmail.com,colega@gmail.com`).
2. Cada pessoa cria a própria conta normal no site com esse e-mail e entra em
   `https://SEU-APP.onrender.com/admin.html` com a mesma senha.
3. O painel tem: visão geral com gráficos, usuários (buscar, suspender,
   reativar, ativar Pro, bônus, aviso, excluir), verificação de CAU, projetos,
   matches, contratações, moderação de avaliações, financeiro, faixa de aviso
   do site, comunicados para todos, auditoria de cada ação e saúde do sistema.
4. O texto das mensagens entre clientes e arquitetos **não** aparece no painel
   (privacidade); só os números.

### Lojas parceiras: catálogo importado do site

Em Painel → Produtos, a loja cola o endereço do site e os produtos entram de uma
vez (nome, foto, preço, link de compra, categoria e estilos/materiais deduzidos
pelo nome). Fontes usadas, em ordem: feed XML (Google Shopping/Facebook),
Shopify (`/products.json`), WooCommerce (Store API), VTEX (catálogo público),
`/google_shopping.xml` (Nuvemshop) e, para qualquer outro site, os dados
estruturados schema.org das páginas de produto (sitemap, até 80 páginas).
Limite de 1.000 produtos por loja; "Sincronizar de novo" atualiza preços e tira
o que saiu do site; produtos cadastrados à mão nunca são apagados. O servidor
só acessa endereços públicos (bloqueio de IPs internos) e no máximo uma
importação por minuto por loja.

### Estúdio 3D (arquitetos) — opcional

Painel do arquiteto → **Estúdio 3D**: gera um modelo 3D a partir de texto ou
foto (Tripo) ou de uma planta baixa (MeltFlex), guarda no banco e compartilha
com clientes com quem ele já conversou ou que pediram contratação. Os dois
abrem `modelo-3d.html`, giram o modelo e comentam. O cliente vê em
Painel → **Modelos 3D**.

1. **Tripo** (objeto por texto/foto): crie a conta em https://platform.tripo3d.ai,
   gere a chave em API Keys (há créditos grátis no cadastro) e coloque em
   `TRIPO_API_KEY` no Render.
2. **MeltFlex** (planta → 3D): assine um plano em https://www.meltflexai.com,
   copie a chave em Profile → API Key e coloque em `MELTFLEX_API_KEY`.
   Cada planta em 3D custa 100 créditos deles.
3. `MODEL3D_DAILY_LIMIT` (padrão 5) limita quantos modelos cada arquiteto gera
   a cada 24 h — é o controle de gasto de créditos.

Sem as chaves, em produção a opção aparece como "não configurada" (o resto do
site não muda). No computador de desenvolvimento roda em modo demonstração,
devolvendo um modelo de exemplo. Os arquivos `.glb` ficam no MongoDB (GridFS):
de olho no limite de 512 MB do Atlas M0 se o uso crescer.

## 6. Antes de abrir para o público

- **Contas de demonstração**: a senha delas (`MatchIA@Demo2026`) está pública no
  repositório. Qualquer pessoa conseguiria entrar como esses arquitetos. Antes
  de divulgar, no painel → Usuários, busque `arquitetos.demo` e exclua essas
  contas (e as contas de teste), ou mantenha só enquanto apresentarem o TCC.
- **Pagamentos**: o checkout do plano Pro, as comissões e as indicações de loja
  são **simulados** (não cobram ninguém). Para cobrar de verdade é preciso
  integrar Mercado Pago ou Stripe. Até lá, a equipe ativa o Pro pelo painel.
- **Render grátis** dorme após ~15 min sem visitas (a 1ª visita leva ~50 s).
  Para uso público contínuo, o plano Starter (US$ 7/mês) mantém o site acordado.
- **Atlas M0** (512 MB) aguenta bem o começo; as fotos de perfil ficam no banco
  (~40 KB cada). Acompanhe em Atlas → Metrics e suba de plano quando passar de ~70%.
- **Gemini**: a chave grátis tem limite por minuto/dia. Se o match ou o
  assistente começarem a falhar com muita gente, ative o faturamento no Google AI Studio.

## O que o servidor já faz em produção

- **Só publica o que é site**: `assets/`, as páginas `.html`, `manifest.json` e
  `sw.js`. `backend/` (com o `KEYS.env`), `node_modules/`, scripts, docs e as
  pastas `dev/` de ferramentas respondem 404.
- **Content-Security-Policy** em todas as páginas: o navegador só executa
  scripts do próprio site e dos CDNs usados (unpkg, jsdelivr). Script
  injetado por texto de usuário não roda.
- **Cabeçalhos de segurança** (nosniff, referrer, anti-iframe) e IP real do
  visitante atrás do proxy (limites de uso por pessoa, não por servidor).
- **Cache**: páginas, CSS e JS são revalidados a cada visita (mudanças aparecem
  na hora); fotos, 3D e áudio ficam 1 dia no navegador.
- Rodando localmente, `npm run dev` (Atlas) ou `npm run dev:local` (banco local
  com dados de demonstração) — ver README.

## 7. Checklist final

- [ ] `https://SEU-APP.onrender.com/api/health` responde `{"status":"ok"}`
- [ ] `https://SEU-APP.onrender.com` carrega a home com fotos e animações
- [ ] `https://SEU-APP.onrender.com/backend/KEYS.env` responde 404
- [ ] `https://SEU-APP.onrender.com/destaques.html` abre (lista os arquitetos já cadastrados)
- [ ] Cadastro de um cliente novo funciona e cai no fluxo de novo projeto
- [ ] Conta de loja → Painel → Produtos → "Importar do site da sua loja" traz os produtos
- [ ] Match de um projeto retorna arquitetos com explicação da IA
- [ ] Assistente (chatbot) responde no painel do cliente
- [ ] Cadastro com um e-mail real recebe o e-mail de boas-vindas (Brevo)
- [ ] "Esqueci minha senha" envia o link e ele abre `redefinir-senha.html`
- [ ] Trocar a foto de perfil em Painel → Conta e ver a foto no perfil/conversas
- [ ] `admin.html` abre com um e-mail de `ADMIN_EMAILS` e recusa os outros
- [ ] Contratar um arquiteto → entrar como o arquiteto (contas de demonstração:
      senha `MatchIA@Demo2026`) → aba **Contratações** → aceitar → o projeto
      aparece em "Projetos fechados pela plataforma" no perfil público
