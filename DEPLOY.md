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
4. A URL pública (algo como `https://matchia.onrender.com`) já serve o site
   inteiro. `assets/js/api.js` usa o caminho relativo `/api`, que funciona em
   qualquer domínio.
5. Banco novo vazio? Rode os seeds uma vez contra o Atlas, do seu computador
   (com o `MONGODB_URI` do Atlas no `backend/KEYS.env`), dentro de `backend/`:
   `npm run seed:materials`, `npm run seed:architects`, `npm run seed:demo`.

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

## 5. Checklist final

- [ ] `https://SEU-APP.onrender.com/api/health` responde `{"status":"ok"}`
- [ ] `https://SEU-APP.onrender.com` carrega a home com fotos e animações
- [ ] `https://SEU-APP.onrender.com/backend/KEYS.env` responde 404
- [ ] `https://SEU-APP.onrender.com/destaques.html` lista arquitetos
- [ ] Cadastro de um cliente novo funciona e cai no fluxo de novo projeto
- [ ] Login com a conta demo (`demo@matchia.com` / `MatchIA@Demo2026`) funciona
- [ ] Match de um projeto retorna arquitetos com explicação da IA
- [ ] Assistente (chatbot) responde no painel do cliente
- [ ] Cadastro com um e-mail real recebe o e-mail de boas-vindas (Brevo)
- [ ] "Esqueci minha senha" envia o link e ele abre `redefinir-senha.html`
- [ ] Contratar um arquiteto → entrar como o arquiteto (contas de demonstração:
      senha `MatchIA@Demo2026`) → aba **Contratações** → aceitar → o projeto
      aparece em "Projetos fechados pela plataforma" no perfil público
