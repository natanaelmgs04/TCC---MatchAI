# match.IA — Site (Front-end)

Site institucional e aplicação web do **match.IA**, projeto de TCC (FIAP School) que conecta
clientes e arquitetos por meio de compatibilidade calculada por Inteligência Artificial.

Front-end estático (HTML + CSS + JS puro, sem build step) construído a partir da identidade
visual e da documentação do TCC, com integração pronta para o back-end de referência
[Arkitetum.AI](https://github.com/RobPFilho/Arkitetum.AI) (Node.js + Express + MongoDB).

## Estrutura

```
index.html         Landing page (hero, como funciona, vitrine de projetos + ranking, CTA)
cadastro.html       Cadastro enxuto de cliente/arquiteto/loja (POST /api/auth/register/:role)
login.html          Login (POST /api/auth/login)
dashboard.html       Painel autenticado — drawer de projetos/portfólio/produtos por papel
arquiteto.html       Perfil público de arquiteto (GET /api/architects/:id)
projetos.html         IA sob medida + vitrine de projetos + banco de materiais
sobre.html           Empresa, modelo de negócio, mercado e time (a partir do TCC)
blog.html            Blog institucional (stub)
assets/css/style.css  Design system (cores, tipografia, componentes)
assets/js/api.js      Cliente da API (fetch + sessão em localStorage)
assets/js/drawer.js   Menu lateral genérico (lista → detalhe) usado no painel
assets/js/showcase.js Carrossel de projetos + ranking (home/projetos)
assets/js/*.js         Lógica de cada página
assets/img/mark.svg   Símbolo da marca (casa + pessoas + arco tecnológico)
assets/3d/            Estudo volumétrico 3D (three.js) — não é mais referenciado por
                       nenhuma página, ver "Reformulação pós-mentorias v2" abaixo
```

## Identidade visual

- **Cores**: Off-white quente `#FAF9F6`, Bege areia `#EEE3DA`, Verde sálvia `#7B8E7E`,
  Terracota/cobre `#B0755A`, Grafite `#333333`.
- **Tipografia**: Playfair Display (títulos) + Inter (corpo de texto).
- **Símbolo**: casa (arquitetura) + pessoas (cliente e arquiteto) + arco com circuitos
  (tecnologia/IA) — ver `assets/img/mark.svg`.

## Rodando localmente

**Um processo só serve tudo** — o Express em `backend/src/server.js` responde a API
(`/api/*`) e também o site estático (HTML/CSS/JS da raiz), na mesma porta:

```bash
npm install      # só na primeira vez: instala o site e o backend (versões do package-lock)
npm run setup    # num computador novo: cria backend/KEYS.env a partir do modelo e confere o que falta
npm run dev      # usa o MongoDB do KEYS.env (Atlas)
```

**Sem o KEYS.env, ou numa rede que bloqueia o Atlas** (laboratório, empresa): `npm run dev:local`.
O servidor sobe um MongoDB local dentro do projeto (`backend/.localdb`, fora do Git), já com
materiais, arquitetos de demonstração e a conta demo (`demo@matchia.com` / `MatchIA@Demo2026`).
Dá para criar contas normalmente, mas elas ficam só naquele computador. Na primeira vez ele
baixa o MongoDB (~600 MB no Windows, uma vez por usuário).

O `backend/KEYS.env` guarda as senhas (MongoDB, Gemini…) e por isso não está no Git — copie
o seu de um computador que já roda o projeto, ou preencha o criado pelo `npm run setup`
(modelo com os nomes das variáveis em `backend/KEYS.env.example`). Se faltar algo, o
`npm run dev` diz exatamente o quê, em vez de um erro seco.

Depois acesse **`http://localhost:3000`** — é a mesma URL pro site e pra API, não tem
mais duas portas nem dois processos pra coordenar. Em desenvolvimento os arquivos do site
são servidos sem cache (headers `Cache-Control: no-store`), então uma alteração em
qualquer arquivo aparece no reload sem precisar de Ctrl+Shift+R.

`Ctrl+C` encerra tudo. Se preferir, `cd backend && npm run dev` faz exatamente a mesma
coisa (o comando na raiz só delega pra lá).

Sem o MongoDB no ar, o servidor não sobe (a conexão é obrigatória no `connectDatabase()`);
com o Mongo no ar mas alguma chave de API faltando (Gemini, Unsplash), as funcionalidades
de IA caem em respostas padrão em vez de falhar — ver `KEYS.env`.

## Publicando (Arkitetum.AI de referência)

Como o site e a API agora são o mesmo processo, publicar é só subir a pasta `backend/`
inteira (que inclui o site na raiz do projeto, um nível acima) num serviço Node — ver
`DEPLOY.md` pro passo a passo com Render. O repositório de referência original,
[Arkitetum.AI](https://github.com/RobPFilho/Arkitetum.AI), continua sendo a base do
back-end (rotas, modelos, autenticação) — este projeto é um fork local dele mais o
front-end e os módulos novos.

## Artefato 3D

`assets/3d/mansion-3d.html` é um estudo volumétrico interativo (three.js) de uma residência
contemporânea, usado como exemplo de "IA auxiliando no desenvolvimento do projeto" — é
carregado via `<iframe>` na home (`#ia-projeto`) e na página `projetos.html`.

## Módulos novos no back-end (mensagens, avaliações, moodboard, CAU)

A pasta `backend/` (clone local do Arkitetum.AI) recebeu 3 módulos aditivos — arquivos novos,
nada do código original do Roberto foi alterado além de 3 linhas em `server.js` (import +
`app.use`) e um campo novo em `User.js` (`architectProfile.cauVerification`):

- `POST /api/messages`, `GET /api/messages/:userId`, `GET /api/messages/conversations` — chat
  entre cliente e arquiteto (modelo `Message`).
- `POST /api/reviews`, `GET /api/reviews/:architectId` — avaliações com nota e comentário
  (modelo `Review`), exibidas no perfil público do arquiteto.
- `POST /api/moodboard` — gera um parágrafo de conceito visual via Gemini a partir do
  questionário do cliente (usa a mesma `GEMINI_API_KEY` do match; sem a chave, cai num texto
  padrão simples).
- `architectProfile.cauVerification: { number, status }` — o arquiteto solicita verificação
  pelo painel (`status` vira `"pending"`); a equipe aprova manualmente. A forma recomendada é
  `npm run approve:cau -- email@do-arquiteto.com` (dentro de `backend/`) — atualiza o status
  para `"verified"` **e** dispara o e-mail de confirmação (real ou simulado, ver seção de
  e-mail abaixo). Rodar direto no Mongo (`db.users.updateOne(...)`) ainda funciona para
  ajustes rápidos, mas não passa pelo código da aplicação, então não envia o e-mail. Não
  existe (nem deveria existir, nesta fase) verificação automática contra a base pública do
  CAU/BR — a aprovação é sempre uma decisão humana da equipe.

**Antes de mandar isso pro repositório principal**, esses arquivos precisam da revisão do
Roberto — não fizemos `git push`, só editamos o clone local em `backend/`.

## Chave da IA (Gemini) e arquitetos fictícios de demonstração

- A `GEMINI_API_KEY` usada por `geminiService.js` (explicações de compatibilidade) e
  `moodboardController.js` (moodboard) fica **só** em `backend/KEYS.env` (arquivo local,
  no `.gitignore`, nunca enviado ao front-end nem logado no console) — é uma chave paga,
  então os dois módulos usam o modelo mais econômico disponível, `gemini-3.5-flash-lite`
  (o `gemini-1.5-flash` original foi descontinuado pelo Google), e nenhuma chamada extra de
  IA foi adicionada além dessas duas já existentes, para não estourar o plano.
- `npm run seed:architects` (dentro de `backend/`) cria 10 arquitetos fictícios com estilos,
  materiais, cidades e experiências variadas, só para o algoritmo de match ter bons
  resultados neste protótipo (identificáveis pelo domínio de e-mail
  `@match.arquitetos.demo`). É seguro rodar mais de uma vez — o script pula quem já existe.

## Múltiplos projetos, mensagens não lidas, e-mail e mais robustez no back-end

- **Múltiplos projetos do cliente**: além do perfil principal (dados do cadastro), o cliente
  pode criar projetos extras no painel ("Meus projetos" em `dashboard.html`) — cada um com
  seu próprio estilo, orçamento, materiais e objetivos — e rodar um match separado para cada
  um (`POST /api/matches/run` aceita `{ projectId }` opcional; sem ele, usa o perfil do
  cadastro como antes). Modelo novo `Project` + rotas em `/api/projects`. O limite do plano
  Gratuito (1 projeto extra) é o mesmo tipo de checagem client-side já usado no restante do
  freemium — não é uma trava de segurança real, só a régua do modelo de negócio.
- **Mensagens não lidas**: `Message` ganhou o campo `read`; a lista de conversas
  (`GET /api/messages/conversations`) retorna `unreadCount` por conversa, e
  `GET /api/messages/unread-count` alimenta um contador visível na navbar (em qualquer
  página logada) e nos cards de "Mensagens" do painel.
- **Arquitetos em destaque** (`destaques.html`): página pública com todos os arquitetos
  cadastrados, filtrável por estilo, usando o novo `GET /api/architects` (lista) — antes só
  existia a busca por id.
- **E-mail transacional**: `backend/src/services/emailService.js` envia boas-vindas,
  redefinição de senha, mensagens do chat e avisos de contratação. Envia pela API da Brevo
  (`BREVO_API_KEY`, funciona no Render grátis, que bloqueia SMTP) ou por SMTP
  (`EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASS`); sem nenhum dos dois, o e-mail só é registrado no
  console do servidor — nada quebra. Passo a passo em `DEPLOY.md`.
- **Robustez do back-end**: todo handler assíncrono agora passa por `asyncHandler`, então um
  erro de validação do Mongoose (ex.: campo obrigatório faltando) responde 400 ao cliente em
  vez de derrubar o processo Node inteiro (bug real encontrado e corrigido nesta rodada). As
  rotas de IA (`/api/matches/run`, `/api/moodboard`) agora têm limite de 30 chamadas/hora por
  usuário, para não estourar o plano pago do Gemini por engano.
- **Histórico de buscas**: `GET /api/matches/history` lista as últimas 20 buscas do cliente
  (com projeto, resultados e pontuação), exibido no painel em "Histórico de buscas".
- **Validação mútua do resumo do projeto, agora real**: antes o botão "validar" do cliente e
  do arquiteto só gravava no `localStorage` (inclusive o do arquiteto era um "simular"
  clicado pelo próprio cliente). Agora existe o modelo `Validation` (`client`, `architect`,
  `clientConfirmed`, `architectConfirmed`) e as rotas `/api/validations` — o cliente confirma
  do lado dele, e o arquiteto vê um card "Resumos para confirmar" no painel dele e confirma
  de verdade, sem o cliente poder fingir essa parte.
- **Exportar comparativo em PDF**: o comparador lado a lado ganhou um botão de exportação,
  reaproveitando o mesmo mecanismo de impressão do resumo do projeto.

## Mais 5 rodadas: e-mail de fechamento, limite de chat, selo de validação, filtros e testes

- **E-mail quando as duas partes confirmam o resumo**: ao fechar a validação mútua
  (`clientConfirmed` e `architectConfirmed` os dois `true`), cliente e arquiteto recebem um
  e-mail (real ou simulado) avisando que o resumo foi confirmado — só dispara uma vez, na
  transição, não a cada nova chamada do endpoint.
- **Limite de mensagens no plano Gratuito**: `MatchExtras.PLANS.client.free.maxVisibleMessages`
  e o equivalente do arquiteto (ambos = 5; Premium/Pro = ilimitado). O chat mostra só as
  últimas N mensagens de cada conversa no plano Gratuito, com aviso e botão de upgrade —
  mesma régua de freemium client-side já usada no resto do site.
- **Selo "Resumo validado"**: aparece como linha no comparador lado a lado (cliente) e como
  selo "✓ Resumo validado com você" no perfil público do arquiteto (`arquiteto.html`), quando
  as duas partes já confirmaram o resumo daquele match.
- **Filtros e paginação em "Arquitetos em destaque"**: além do filtro por estilo, agora dá
  para filtrar por cidade (com debounce) e experiência mínima, e a lista pagina 9 por vez com
  "Carregar mais" — tudo resolvido no back-end (`GET /api/architects` aceita `city`,
  `minExperience`, `page`, `pageSize`).
- **Testes automatizados do algoritmo de match**: `backend/tests/scoringEngine.test.js` cobre
  cada fator de pontuação isoladamente (estilo, material, localização, especialidade,
  disponibilidade, experiência, os tetos/caps de cada um) e o `rankArchitects` (filtra score
  zero, ordena, limita a 4). Rodar com `npm test` dentro de `backend/`.

## Navbar

O menu foi ajustado depois de crescer para 8 links: fonte um pouco menor (0.85rem),
espaçamento mais enxuto, e o breakpoint do menu hambúrguer subiu de 900px para 1180px (com 8
links + logo + ações, esse é o ponto real onde para de caber numa linha só). Também corrigido
um bug em que o menu mobile (`position: fixed` com `inset: 72px 0 0 0`) calculava altura
errada nesta ferramenta de preview — trocado por `top/left/right` + `height: calc(100vh -
72px)` explícitos, que é mais robusto entre navegadores.

## Assinatura (freemium) e outras funcionalidades novas

- **Planos** (`planos.html`): cliente Gratuito (3 buscas/mês, 2 resultados) vs Premium R$29/mês;
  arquiteto Gratuito (3 projetos) vs Pro R$49/mês. O "checkout" é uma simulação (sem gateway de
  pagamento) — ver `assets/js/checkout.js` e `MatchExtras.setPlan` em `assets/js/extras.js`.
- **Modo escuro**: botão 🌓 na navbar, alterna sistema/claro/escuro (`assets/js/theme.js`).
- **PWA**: `manifest.json` + `sw.js` (service worker "network-first" — nunca esconde uma
  atualização recente atrás de cache).
- **Exportar PDF, moodboard com IA, comparador de arquitetos, compartilhar perfil (link + QR)**:
  tudo no painel (`dashboard.html` / `assets/js/dashboard.js`).

## Referência visual real (foto, não geração de imagem)

Botão "🖼 Ver referência visual" ao lado do moodboard, no painel do cliente
(`POST /api/moodboard/reference-image`): busca uma foto real de arquitetura/interiores
parecida com o estilo/materiais/palavras-chave do cliente, via **API do Unsplash**
(banco de fotos gratuito, sem cartão, licenciado para uso livre — chave em
`UNSPLASH_ACCESS_KEY` no `KEYS.env`, servidor apenas).

Decidimos por isso em vez de gerar a imagem com IA (Gemini "Nano Banana" ou DALL-E)
porque geração de imagem é paga desde a primeira chamada em qualquer provedor testado
(~$0,04/imagem no Gemini, sem camada gratuita) — buscar uma foto real já existente
resolve o mesmo problema ("é mais ou menos assim que você imagina?") sem custo nenhum.
O texto em português do cliente é traduzido pra uma busca em inglês pelo Gemini
(reaproveitando a mesma chamada de texto, dentro do limite gratuito); se o Gemini
falhar, cai num dicionário de tradução simples do vocabulário fixo de estilos/materiais
do site, então a busca nunca quebra por causa da tradução. Toda foto exibida credita o
fotógrafo e o Unsplash com link, conforme exigido pela licença da API.

## Formulário de cadastro "inteligente" e banco de materiais real

- **Banco de materiais com fotos reais**: `npm run seed:materials` agora busca uma foto
  real e distinta no Unsplash pra cada um dos 18 materiais (antes, todos usavam a mesma
  imagem genérica — o "banco de materiais" existia no código mas não cumpria o que a
  própria página `projetos.html` prometia). O `Material` ganhou os campos
  `photographerName`/`photographerUrl` pra manter a atribuição correta.
- **Chips de material com miniatura**: no cadastro (cliente e arquiteto), cada chip de
  material agora mostra a foto do próprio banco de materiais ao lado do nome — não é
  mais só texto. Função `buildChipList` em `cadastro.js` ganhou suporte a `item.thumb`.
- **Prévia visual no resumo do cadastro**: a última etapa do cadastro (antes de criar a
  conta) busca automaticamente uma referência visual real no Unsplash a partir dos
  estilos e materiais escolhidos nas etapas anteriores — "É mais ou menos assim que
  você imagina?" — pra cliente e arquiteto. Como isso acontece antes de existir conta/
  token, criei uma rota pública `POST /api/moodboard/preview` (sem login, limitada por
  IP a 20/hora, já que não dá pra identificar o usuário ainda).

## Mais integrações do Unsplash e finalização do painel

- **Referência visual do arquiteto, calculada uma vez e cacheada**: `architectProfile.referenceImage`
  guarda a foto real gerada a partir do estilo/materiais do arquiteto — calculada na
  primeira vez que alguém precisa dela (`GET /api/architects/:id/reference-image`) e
  reaproveitada depois por qualquer cliente, em qualquer lugar. Isso é o que permite os
  dois itens abaixo sem estourar o limite de 50 buscas/hora do Unsplash: um arquiteto
  popular nos resultados de match não gera uma busca nova a cada clique, só na primeira vez.
  - **Perfil público do arquiteto**: card "Referência visual" ao lado da paleta de estilo.
  - **Resultados de match**: miniatura de 56x56px ao lado do nome de cada arquiteto sugerido.
- **Banco de materiais e blog**: o banco de materiais já usa fotos reais (seção acima); os
  3 posts do blog já tinham capas reais do Unsplash desde antes — conferido que continuam
  no ar.
- **Checklist de onboarding do arquiteto**: card "Complete seu perfil" no painel,
  mostrando o que falta (bio, portfólio, materiais favoritos, perfil de estilo,
  verificação CAU) — só aparece enquanto houver pendência, some sozinho quando tudo
  estiver completo.
- **E-mail ao receber avaliação**: mesmo padrão dos outros e-mails (simulado sem SMTP
  configurado) — o arquiteto é avisado quando um cliente avalia o atendimento.

## Bug importante corrigido: navbar não detectava login em lugar nenhum

`site.js` checava `window.MatchAPI` pra saber se a API carregou, mas `MatchAPI` é
declarado com `const` no topo de `api.js` — e `const`/`let` no nível raiz de um script
clássico **não** viram propriedade de `window` (só `var`/`function` viram). Resultado:
essa checagem sempre dava falso, então em toda página do site (fora do próprio painel)
a navbar mostrava "Entrar/Cadastrar" mesmo com o usuário logado, o contador de mensagens
não lidas nunca aparecia, e a estatística real da home nunca calculava. Corrigido
trocando as 3 ocorrências por `typeof MatchAPI !== 'undefined'`, que funciona
independente de como a variável foi declarada. Vale testar de novo o "Entrar" vs. nome
do usuário na navbar de cada página depois de long tempo sem revisar isso.

## Filtro de avaliação, comparador público, notificações, PDF do match e indicação

- **Filtro por avaliação + comparador em `destaques.html`**: `GET /api/architects` agora
  calcula a média de avaliações por arquiteto via `$lookup` na coleção `reviews` (campo
  `minRating` no filtro). Cada card tem uma caixa "Comparar" (até 4 arquitetos) que abre
  o mesmo tipo de tabela comparativa do painel, sem precisar estar logado.
- **Central de notificações no site**: sino 🔔 na navbar (visível logado, qualquer
  página) agregando os eventos que já existiam como e-mail — mensagem nova, avaliação
  recebida, resumo validado, CAU aprovado, e agora também indicação — model `Notification`
  novo, rotas `/api/notifications` (`GET /`, `GET /unread-count`, `POST /read-all`).
- **Exportar resultados do match em PDF**: reaproveita o mesmo mecanismo de impressão já
  usado pro resumo do projeto e pelo comparativo.
- **Programa de indicação real**: cada usuário tem um link próprio
  (`cadastro.html?ref=<seu-id>`) no card "Convide e ganhe" do painel. Quem se cadastra
  por esse link grava `referredBy` no próprio usuário (campo novo em `User`), e quem
  indicou ganha um bônus real e persistido: +1 busca de match (cliente,
  `clientProfile.bonusMatches`) ou +1 vaga de portfólio (arquiteto,
  `architectProfile.bonusPortfolioSlots`) — somado ao limite do plano em todos os
  lugares que checam esse limite no painel.

## Enter no formulário de cadastro e contraste no modo escuro

- **Enter não submete mais o formulário de cadastro**: o wizard de `cadastro.html` é um
  único `<form>` com 8 etapas; sem tratamento, dar Enter em qualquer campo submetia o
  formulário inteiro (ainda incompleto) em vez de avançar pra próxima etapa. Agora um
  listener de `keydown` em `assets/js/cadastro.js` intercepta Enter e clica no botão
  "Avançar" (respeitando a mesma validação de sempre), exceto em `<textarea>` (onde
  Enter continua quebrando linha) e na última etapa (onde só o clique explícito em
  "Criar conta" envia de verdade).
- **Contraste no modo escuro**: nenhuma regra do CSS declarava `color-scheme`, então
  controles nativos do navegador (o dropdown de `<select>` ao abrir, ícones de campo
  numérico) ignoravam o tema escuro customizado e renderizavam com as cores padrão do
  sistema — texto claro sobre fundo claro em alguns casos. Adicionado `color-scheme:
  light`/`dark` nos três blocos de tema em `assets/css/style.css`. Também corrigido o
  autopreenchimento do navegador (autofill), que forçava fundo branco/texto preto nos
  campos preenchidos automaticamente, ignorando completamente o tema da página.

## Footer invisível no escuro e logo sobreposta no mobile

- **Footer**: `.site-footer` usava `background: var(--ink)`, mas essa variável é o
  texto do resto do site — no modo escuro ela vira clara, deixando fundo e texto do
  footer ambos claros (ilegível). Fixado com cores literais (`#333333`/`#FAF9F6`) pra
  manter a faixa sempre escura, nos dois temas.
- **Navbar no celular**: logo, "Entrar", "Cadastrar" e o hamburguer não cabiam numa
  linha só em telas estreitas; a logo encolhia mais que seu próprio conteúdo (que tem
  `overflow: visible`), então o texto ".IA" vazava por cima do "Entrar" ao lado.
  Espaçamentos apertados abaixo de 430px de largura resolvem sem cortar nem sobrepor
  nada — testado em 375px e 320px.

## Limpeza de histórico de teste, skeletons de carregamento e acessibilidade

- **`npm run clean:matches -- email@cliente.com`** (dentro de `backend/`): apaga o
  histórico de matches de um único cliente — pensado para remover buscas de teste
  feitas com perfil incompleto, que distorcem a média real usada em `GET /api/stats`.
  Segue o mesmo padrão do `approve:cau` (script pontual, com o e-mail como argumento,
  nunca uma operação em massa).
- **Skeletons de carregamento**: a lista de arquitetos em destaque (`destaques.html`),
  os resultados de match no painel e o banco de materiais (`projetos.html`) agora
  mostram um placeholder animado (`.skeleton-card`/`.skeleton-result` em
  `assets/css/style.css`) enquanto aguardam a resposta da API, em vez de ficarem
  simplesmente vazios/parados.
- **Acessibilidade**: link "Pular para o conteúdo principal" (visível só ao navegar
  por Tab) em todas as páginas; `aria-pressed` nos chips de seleção do cadastro
  (estilos, materiais, etc.) pra leitores de tela anunciarem o estado selecionado;
  `aria-label` nos botões só-ícone que ainda não tinham (confirmar/cancelar do "+
  Outros..."); `role="alert"`/`aria-live` nos avisos de erro de API e de formulário,
  pra serem anunciados automaticamente. Os básicos (`alt` em imagens, `aria-label` no
  sino de notificações, no toggle de tema e no menu hambúrguer, `lang="pt-BR"` no
  `<html>`, indicador de foco visível nos campos) já estavam corretos.
- **Meta tags Open Graph e Twitter Card**: todas as páginas agora têm
  `og:title`/`og:description`/`og:image`/`og:type` e as tags `twitter:*`
  equivalentes, pra gerar um preview decente ao compartilhar links do site (WhatsApp,
  LinkedIn, etc.) — antes só o `<title>` aparecia, sem imagem nem descrição.

## Segunda rodada de acessibilidade (baixa visão, cegueira, motora)

- **Contraste de texto (WCAG AA)**: medido com a fórmula oficial de contraste —
  `--ink-faint` no modo claro estava em **2.32:1** (mínimo exigido é 4.5:1 pra texto
  normal), praticamente ilegível pra quem tem baixa visão; `--ink-soft` estava em
  4.29:1, também abaixo do mínimo. Recalibrado pra 4.55:1 e 5.41:1 respectivamente,
  mantendo `--ink-faint` visualmente mais claro que `--ink-soft`. O modo escuro já
  media acima de 4.5:1 nos dois, não precisou mexer.
- **Diálogos acessíveis** (modal de assinatura em `checkout.js` e roda de cores em
  `color-wheel.js`): antes eram só uma `<div>` sobreposta, sem `role="dialog"`,
  sem mover o foco ao abrir, sem fechar com Esc e sem devolver o foco a quem abriu
  ao fechar — um usuário de teclado ou leitor de tela podia "perder" o diálogo ou
  continuar navegando o conteúdo por trás dele. Agora ambos têm
  `role="dialog"`/`aria-modal`/`aria-labelledby`, prendem o Tab dentro do diálogo,
  fecham com Esc e devolvem o foco ao elemento que abriu o diálogo. Os campos
  HEX/R/G/B da roda de cores ganharam `<label for>` de verdade (antes eram só texto
  ao lado, sem associação programática) — é a alternativa acessível à roda visual
  em si, que agora é marcada `aria-hidden` (só decorativa/mouse, sem substituto de
  teclado possível numa interação de arrastar em círculo).
- **Avaliação por estrelas** (`assets/js/dashboard.js`): os 5 botões de estrela
  eram só o caractere "★" sem nome acessível nenhum — um leitor de tela lia
  "botão" cinco vezes, sem dizer qual nota cada um representa. Agora o grupo é
  `role="radiogroup"` com `aria-label`, e cada botão tem `aria-label="N estrelas"`
  e `aria-checked` refletindo a nota selecionada.
- **Movimento reduzido**: quem ativa "reduzir movimento" no sistema operacional
  agora tem quase todas as transições/animações do site desligadas (shimmer dos
  skeletons, hover, fade de entrada, modais) via `prefers-reduced-motion`, e as
  rolagens automáticas (`scrollIntoView`) deixam de ser suaves e passam a ser
  instantâneas — para quem sente tontura ou desconforto com telas em movimento.
- Sobre "mudo/surdo": o site não depende de áudio ou vídeo em nenhum fluxo — toda
  interação é por texto, e o chat entre cliente e arquiteto já existe como
  alternativa à ligação telefônica. Não havia nada de específico faltando aqui além
  do que a rodada de contraste/diálogos acima também melhora.

## Categorias de match (não é só o "top 4")

Antes, `POST /api/matches/run` buscava só arquitetos com `availability !== "unavailable"`
e devolvia os 4 com maior pontuação — todo o resto (indisponível, fora da região, fora
do orçamento) simplesmente desaparecia sem explicação. Agora `categorizeMatches()`
(`backend/src/services/scoringEngine.js`) avalia **todos** os arquitetos e separa por
motivo:

- **🏆 Melhor compatibilidade**: o match de sempre (disponível, atende a região, dentro
  do orçamento) — é o único grupo que entra no limite de resultados do plano Gratuito.
- **⏳ Compatível, mas indisponível no momento**: bom estilo/materiais, mas
  `availability: "unavailable"` — antes não aparecia em lugar nenhum.
- **📍 Fora da sua região**: bom estilo, mas não atende a cidade/estado do cliente.
- **💰 Fora do seu orçamento**: exige que o arquiteto tenha cadastrado uma faixa de
  preço (`architectProfile.priceRange`, campo novo no cadastro — etapa "Perfil
  profissional") que não cruza com o orçamento do cliente. Sem faixa de preço
  cadastrada de um dos lados, não classifica nessa categoria (falta de dado não vira
  suposição de incompatibilidade).
- **🌟 Fora do estilo pedido, mas muito bem avaliado**: arquitetos sem nenhuma afinidade
  real de estilo/material/especialidade, mas com nota média ≥ 4 e pelo menos uma
  avaliação — um bônus de "a IA também pensa fora da caixa".
- Tag **"📍 Mesma cidade"** direto no card (em vez de mais uma categoria separada,
  que ficaria redundante com o grupo principal).

Cada categoria extra é limitada a 3 resultados e usa uma explicação padrão (sem
chamada à Gemini) para não estourar a cota de IA — só o grupo principal recebe a
explicação gerada por IA, como já era antes. As categorias extras ficam sempre
visíveis, sem entrar no bloqueio do plano Gratuito, e continuam totalmente
interativas (chat, avaliação, detalhes da pontuação, sugestões de materiais).

As categorias aparecem como **abas** (`#matchTabs`) em vez de uma lista comprida
empilhada — só a aba ativa fica visível, com contagem entre parênteses em cada
uma. Segue o padrão de acessibilidade de abas: `role="tab"`/`role="tabpanel"`,
`aria-selected`, e navegação por teclado (setas, Home/End) com foco seguindo a
aba ativa. Sem nenhuma categoria extra, a barra de abas some e só o match
principal aparece — igual a antes de existir a categorização.

**Bug relacionado corrigido**: o SDK do Gemini não tem timeout embutido — sob
alta demanda da API (visto ao vivo durante o desenvolvimento, erros 503), uma
chamada podia ficar pendurada sem nunca resolver nem falhar, travando o match
inteiro indefinidamente em vez de cair na explicação padrão. Adicionado um
timeout de 8s (`Promise.race`) em `explainCompatibility()` — na pior das
hipóteses, o cliente espera 8s e recebe a explicação padrão, nunca trava.

## Painel reorganizado em seções

O painel (`dashboard.html`) era uma pilha de ~10 cards brancos idênticos, sem
nenhuma hierarquia visual entre eles — difícil de escanear, parecia "tudo
jogado na tela". Reorganizado em **seções com título** (`.dash-section`,
`.dash-section-title`): pro cliente, "📁 Seu projeto" (resumo, moodboard,
referência visual, projetos), "🤝 Compatibilidade com arquitetos" (as abas de
categoria, histórico) e "💬 Mensagens"; pro arquiteto, "✅ Seu perfil" (estilo,
verificação), "📁 Portfólio & divulgação" (compartilhar, portfólio,
avaliações) e "💬 Mensagens". Os cards "precisam da sua atenção" (checklist
incompleto, resumo esperando confirmação) ganharam um risco na cor da marca
pra se destacar do resto sem gritar. Parágrafos e fileiras de botão que
repetiam `style="font-size:0.88rem"`/`style="display:flex; gap:10px"` inline
em cada card viraram classes (`.card-lead`, `.card-actions`), centralizando o
espaçamento num lugar só em vez de espalhado pelo HTML.

## Favoritos, aviso de disponibilidade, avaliação sem duplicata e estados vazios

- **Favoritar arquiteto pra depois**: botão "☆ Salvar para depois" em qualquer
  resultado do match — inclusive nas categorias extras (indisponível, fora da
  região, fora do orçamento), que é onde mais faz sentido guardar alguém que
  não virou o match principal agora mas pode valer a pena revisitar. Nova
  seção "⭐ Favoritos" no painel do cliente lista tudo que foi salvo, mesmo
  sem rodar um novo match. Model novo (`Favorite`, único por
  cliente+arquiteto), rotas `/api/favorites` (`GET`/`POST /:id`/`DELETE /:id`,
  só para clientes), incluído na exportação e exclusão de dados (LGPD) e no
  script `delete:accounts`.
- **Aviso quando um arquiteto "indisponível" libera agenda**: se um arquiteto
  muda `availability` de `"unavailable"` para qualquer outro valor,
  `dashboardController.updateMe` busca (últimos 30 dias) quem teve esse
  arquiteto na categoria "indisponível" numa busca de match e manda uma
  notificação — reaproveitando o sino que já existia, em vez de deixar essa
  mudança passar batido pro cliente que só via aquele card "sem agenda
  aberta agora".
- **Avaliação não duplica mais**: `Review` ganhou índice único
  (cliente+arquiteto) e `createReview` virou upsert — reenvio ou clique duplo
  atualiza a mesma avaliação em vez de criar outra. Descoberto ao limpar uma
  avaliação de teste duplicada que tinha sobrado de uma sessão anterior.
- **Estados vazios com ícone**: portfólio vazio, histórico sem buscas,
  conversa sem mensagens e favoritos vazios agora usam um bloco padrão
  (ícone + texto + ação quando faz sentido, tipo "+ Adicionar o primeiro
  projeto") em vez de um parágrafo cinza solto sem nenhum apelo visual.
- **`projetos.html` não precisou da mesma reorganização em seções do
  painel** — ao revisar, já é uma página de seções bem demarcadas (mesmo
  padrão do resto do site institucional), diferente da pilha de cards
  idênticos que o painel era antes.
- **Bug real encontrado no caminho**: `favoriteIds` (o `Set` que marca quais
  arquitetos já estão salvos) tinha sido declarado no meio do arquivo,
  depois do ponto em que já era lido — um `ReferenceError` de "temporal dead
  zone" silenciosamente engolido pelo `catch`, fazendo o botão de favoritar
  nunca refletir o estado real salvo no banco. Corrigido movendo a
  declaração pro topo do arquivo.

## Painel virou uma página de perfil (capa + abas), inspirado em redes sociais

Reorganização anterior (seções com título) ainda parecia uma pilha de caixas.
Reformulado do zero pra se parecer com um perfil de Instagram/X/TikTok:

- **Capa de perfil**: avatar grande, nome, "handle" (e-mail), localização e os
  botões de ação (Rodar match / Editar perfil), tudo num cabeçalho só —
  substitui a barra lateral fixa que existia antes.
- **Fileira de números** tipo posts/seguidores: buscas feitas e favoritos (
  cliente) ou avaliação média e projetos no portfólio (arquiteto), mais o
  plano atual — todos computados a partir de dados que as próprias funções de
  render já buscavam, sem chamada de API extra.
- **Abas horizontais** no lugar da pilha de seções: "Seu projeto" /
  "Compatibilidade" / "Favoritos" / "Mensagens" / "Conta" pro cliente; "Perfil"
  / "Portfólio" / "Avaliações" / "Mensagens" / "Conta" pro arquiteto. Só uma
  aba de conteúdo fica visível por vez — as abas de categoria de match (do
  round anterior) continuam existindo *dentro* da aba "Compatibilidade",
  então agora tem dois níveis de abas, como um menu com submenu.
- **"Conta"** (editar dados, plano, indicação, LGPD) é compartilhada entre os
  dois papéis — vive fora de `clientPanel`/`architectPanel`, e a aba de cada
  papel só aponta pra ela, em vez de duplicar o card de editar perfil duas
  vezes na página.
- Botões que levam a um conteúdo em outra aba (Rodar match, Rodar match de um
  projeto específico, Mensagem num resultado, Editar perfil) agora trocam de
  aba automaticamente antes de agir — sem isso, o conteúdo era gerado
  corretamente mas ficava invisível numa aba fechada.

**Dois bugs reais achados testando isso:**
- Um scrollbar vertical de 1px aparecia do nada na barra de abas: CSS
  `overflow-x: auto` sem `overflow-y` explícito faz o navegador tratar o eixo
  Y também como `auto` (não pode misturar `visible` com outro valor entre os
  eixos) — um sub-pixel de overflow bastava pra desenhar a barra de rolagem.
  Corrigido com `overflow-y: hidden` explícito.
- No celular, um e-mail comprido sem espaços (não quebra sozinho) empurrava a
  largura do cabeçalho e vazava um scroll horizontal na página inteira —
  mesma causa-raiz do bug da navbar corrigido antes nesta sessão: item flex
  sem `min-width: 0` não encolhe além do tamanho do próprio conteúdo.
  Corrigido com `min-width: 0` + `overflow-wrap: anywhere`.

## "Esqueci minha senha"

Fluxo completo de redefinição de senha, no mesmo padrão de segurança do
`passwordHash` já existente:

- `POST /api/auth/forgot-password` (e-mail) → gera um token aleatório,
  guarda só o **hash SHA-256** dele no usuário (`passwordResetTokenHash`,
  `passwordResetExpires`, ambos `select:false`) e manda um e-mail com o link
  `redefinir-senha.html?token=...`, válido por 1h. Sempre responde a mesma
  mensagem de sucesso, exista ou não a conta — senão dá pra descobrir e-mails
  cadastrados só tentando "esqueci minha senha" com cada um.
- `POST /api/auth/reset-password` (token + nova senha) → acha o usuário pelo
  hash do token (dentro da validade), troca a senha (reaproveitando o hook
  `pre("save")` que já hasheia com bcrypt) e invalida o token — só serve uma
  vez.
- Páginas novas `recuperar-senha.html` (pedir o link) e
  `redefinir-senha.html` (escolher a nova senha, lê `?token=` da URL; sem
  token ou com token inválido/expirado, mostra estado de "link inválido" com
  botão pra pedir outro). Link "Esqueci minha senha" adicionado no
  `login.html`.
- **Melhoria no caminho**: o e-mail simulado (sem SMTP configurado) só
  logava "Para/Assunto" — impossível testar um fluxo com link (como esse)
  sem ver o corpo. `sendEmail` agora loga o texto do e-mail também.

Testado de ponta a ponta: pedido → e-mail simulado com o link → redefinição
→ login com a senha nova funciona e a antiga não → reenviar o mesmo token
depois de usado é rejeitado (uso único) → sem token na URL mostra o estado
de link inválido.

## Verificação: os três cards de "IA sob medida" (`projetos.html`) são reais?

Pergunta levantada: será que a funcionalidade do card do meio ("Sugestões de
materiais") — mockup mostrando materiais restritos ao que o arquiteto tem —
existe de verdade no site, ou é só uma imagem ilustrativa?

Testado ao vivo: **os três são reais**, não só ilustração.
- Card 1 (Perfil de estilo): painel do arquiteto, aba "Perfil".
- Card 2 (Sugestões de materiais): botão "Ver sugestões de materiais" em
  cada resultado de match do cliente — gera combinações reais
  (`MatchExtras.generateMaterialCombos`) só com os `favoriteMaterials` que
  aquele arquiteto específico cadastrou, com a mesma nota de restrição do
  mockup. Confirmado com dados reais: `Fernanda Albuquerque` → "Concreto
  aparente + Madeira de demolição" e "Vidro + Concreto aparente".
- Card 3 (Resumo do projeto validado): card "Resumo do projeto" do cliente
  + "Resumos para confirmar" do arquiteto, com botão de validação dos dois
  lados.

Só não fica no mesmo lugar do mockup (que mostra uma tela dedicada
"Projeto de Ana Beatriz / Sugestões") — na implementação real, fica dentro
de cada resultado de match, o que faz mais sentido: a sugestão já nasce
amarrada ao arquiteto específico que vai executar o projeto.

## Reformulação pós-mentorias v2: cadastro enxuto, match por projeto/portfólio, drawer, Pro real, comissão, lojas parceiras

Rodada grande que supera várias descrições acima (mantidas como histórico, não como
estado atual). Resumo do que mudou de fato:

- **Cadastro** (`cadastro.html`): não é mais um wizard de 8 etapas — é um único passo
  (nome, e-mail, senha, foto de perfil, bio) pros três papéis (cliente, arquiteto e,
  a partir desta rodada, **loja parceira** via `cadastro.html?tipo=loja`). O
  questionário completo de estilo/orçamento/materiais saiu do cadastro; agora é dado
  de **projeto** (cliente) ou de **peça de portfólio** (arquiteto), criado depois do
  login.
- **Match por projeto/portfólio, não por perfil**: `POST /api/matches/run` agora exige
  `projectId` (não existe mais "match pelo perfil geral" — não sobra dado de perfil
  pra isso). `scoreProjectToArchitect` (`scoringEngine.js`) compara o projeto contra
  **cada peça** do portfólio do arquiteto e usa a que melhor combina como motivo do
  match, com um fator novo de proximidade de metragem (`areaM2`).
- **Painel vira um menu lateral deslizante** (`assets/js/drawer.js`, `ProjectDrawer`):
  lista → detalhe, no espírito do menu de conversas do Claude Desktop — substitui os
  formulários inline de "Meus projetos" (cliente), "Meu portfólio" (arquiteto) e
  "Meus produtos" (loja).
- **Assinatura Pro real do arquiteto**: `architectProfile.subscriptionTier` (real, no
  back-end) substitui a simulação 100% front-end que existia em
  `MatchExtras.PLANS`/`getPlan`/`setPlan` (removida). Cliente é **sempre gratuito**,
  sem plano, sem limite de busca, sem resultado bloqueado — isso saiu do produto
  inteiro. `planos.html` foi reescrita: só existe o plano do arquiteto (Free vs Pro),
  e o Pro dá um **bônus** de pontos no ranking (`architectController.listArchitects`),
  nunca um topo garantido — mérito real (nota + projetos fechados) sempre pode
  superar um Pro fraco.
- **Comissão real**: quando cliente e arquiteto confirmam mutuamente que um projeto
  fechou pela plataforma (`Validation`), uma `Commission` simulada é criada e o
  contador `architectProfile.closedProjectsCount` sobe (alimenta o ranking). Aba
  "Comissões" no painel do arquiteto.
- **Lojas parceiras** (novo papel `role: "store"`): loja se cadastra, cadastra os
  próprios produtos (`StoreProduct` — nunca por scraping do site dela), e a IA
  (`storeMatchService.suggestProductsForProject` + `geminiService.extractProjectKeywords`)
  sugere produtos que combinam com o projeto do cliente. Cliente confirma
  explicitamente "Simular compra" (`StoreReferral`, nunca por rastreamento passivo) —
  aba "Indicações" no painel da loja.
- **Vitrine sem 3D**: `assets/3d/mansion-3d.html` não é mais referenciado em nenhuma
  página (arquivo continua no repo, só não é mais exibido). Home e `projetos.html`
  mostram um carrossel de projetos reais com match verificado
  (`GET /api/case-studies/featured`) + um top-5 do ranking de arquitetos, lado a lado
  (`assets/js/showcase.js`).

Consequência prática pra quem for ler as seções acima deste README: qualquer menção a
"plano Gratuito do cliente", "buscas por mês", "wizard de N etapas" ou "3D na home" já
não reflete o estado atual do produto — reflete o estado em que foi escrita.
