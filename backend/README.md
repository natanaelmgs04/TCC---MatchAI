# Arkitetum / Match.ai

Uma aplicação Node.js + MongoDB que conecta clientes e arquitetos. Ela usa um sistema de pontuação com peso e utiliza o Gemini para a expliação de cada pontuação.

## Como rodar o código (em qualquer computador)

Tudo é feito **na raiz do projeto** (a pasta acima de `backend/`):

1. Clone o repositório e abra a pasta no VSCode (`Ctrl + J` abre o terminal);
2. `npm install` — instala o site **e** o backend, nas versões travadas no `package-lock.json`.
   Não rode `npm install <pacote>` avulso: isso puxa versões mais novas que podem quebrar o servidor;
3. Coloque o `KEYS.env` em **`backend/KEYS.env`** (ele fica no Teams/no outro computador; nunca vai para o GitHub).
   Se não tiver, rode `npm run setup`: ele cria o arquivo a partir do `backend/KEYS.env.example` e diz o que falta preencher;
4. No MongoDB Atlas, libere o IP do computador novo em *Security > Network Access*;
5. `npm run dev` e abra `http://localhost:3000`.

Sem o `KEYS.env` ou sem acesso ao Atlas nessa rede: `npm run dev:local` usa um banco local com dados de
demonstração (conta `demo@matchia.com` / `MatchIA@Demo2026`). Os dados criados nele ficam só naquele computador,
e na primeira vez ele baixa o MongoDB (~600 MB).

Banco vazio? Na pasta `backend/`: `npm run seed:materials` (cadastra os materiais; só com o banco vazio, consultar Roberto).

A interface básica se encontra em `http://localhost:3000`. rotas de API estão em `/api`.

## Flows principais

- `POST /api/auth/register/client` e `/architect` criam perfis específicos de cliente/arquiteto.
- `POST /api/auth/login` retorna um token de portador.
- `GET/PATCH /api/dashboard/me` recupera ou atualiza o perfil da conta conectada.
- `POST /api/dashboard/portfolio` permite que o arquiteto adicione um link de portfolio.
- `GET /api/materials` lista materiais semeáveis.
- `POST /api/matches/run` retorna os top 4 arquitetos mais compatíveis ao cliente.

Use `Authorization: Bearer <token>` para rotas protegidas. Gemini é opcional: o match ainda funciona sem IA porém retornará uma explicação genérica.
