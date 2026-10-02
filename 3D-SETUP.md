# Ambiente 3D do match.IA

Preparação técnica para o futuro configurador arquitetônico 3D. **O configurador ainda não existe** — este documento descreve o ambiente pronto para recebê-lo.

## Estrutura atual do projeto (resumo)

| parte | onde | observação |
|---|---|---|
| Páginas | `*.html` na raiz (14 páginas) | HTML estático, sem template |
| Estilo | `assets/css/style.css` (+ `assistente.css`) | tokens em `:root`, tema claro/escuro por `data-theme`, vidro fosco/líquido |
| Scripts | `assets/js/*.js` | scripts clássicos (não-módulo), um por página/recurso |
| Fontes | Google Fonts (Playfair Display, Inter, Poppins) | nenhuma fonte local |
| Imagens | `assets/img/` + Unsplash por URL | |
| 3D existente | `assets/3d/mansion-3d.html` + `three-d-stage.js` | protótipo isolado, three 0.184, não linkado no site |
| Back-end | `backend/` (Express + MongoDB) | **o mesmo processo serve a API e o site** |
| Build | nenhum | sem bundler; bibliotecas de front-end vêm de CDN |
| PWA | `sw.js`, `manifest.json` | service worker network-first |

Bibliotecas de front-end já usadas antes desta etapa, todas via CDN: Spline runtime (robô da aba Assistente), Chart.js (gráficos do painel), three.js (protótipo).

## Dependências preparadas

Nenhum `npm install` no front-end — seguindo a arquitetura existente, as bibliotecas entram por **import map com SRI** (hash `sha384` que o navegador confere antes de executar).

| biblioteca | versão | uso |
|---|---|---|
| three | 0.186.1 | cena 3D |
| three/addons (OrbitControls, GLTFLoader, DRACOLoader, HDRLoader, RoomEnvironment) | 0.186.1 | controles, modelos GLB/GLTF, Draco, iluminação |
| Draco decoder (WASM) | junto do three 0.186.1 | `https://unpkg.com/three@0.186.1/examples/jsm/libs/draco/gltf/` |
| gsap + ScrollTrigger | 3.15.0 | transições de câmera e coreografias |
| lenis (+ `lenis.css`) | 1.3.26 | rolagem suave, só em página dedicada |
| lil-gui | 0.21.0 | **somente desenvolvimento** (painel de debug) |

**Fonte da verdade do import map:** `assets/3d/dev/env-check.html`. Copie o bloco `<script type="importmap">` inteiro para o `<head>` de qualquer página que use 3D, antes de qualquer `<script type="module">`. Import maps têm que ser inline.

Não instalados de propósito: React, React Three Fiber, Next.js, Vite.

## Como executar

```bash
npm run install:all
npm run dev
```

Site e API em `http://localhost:3000`.

## Como testar o ambiente 3D

Abra `http://localhost:3000/assets/3d/dev/env-check.html`. A página carrega cada biblioteca pelo import map canônico, renderiza uma cena, decodifica um modelo Draco de exemplo e mostra 8 verificações. Tudo verde = ambiente pronto. No console: `window.__envCheck` → `{ ok: true, passed: 8, total: 8 }`.

O teste do modelo Draco baixa o "Box" dos exemplos oficiais do Khronos (`raw.githubusercontent.com`); sem internet, esse item falha e os demais seguem.

## Atualizar versões / adicionar um addon

1. Troque a versão na URL (ou adicione a entrada nova) em `assets/3d/dev/env-check.html`.
2. Gere os hashes de **todos** os arquivos do grafo de imports:
   ```bash
   node assets/3d/dev/sri-graph.mjs https://unpkg.com/three@X/build/three.module.js https://unpkg.com/three@X/examples/jsm/loaders/GLTFLoader.js
   ```
   O script segue os imports relativos (ex.: `three.module.js` → `three.core.js`) e imprime `url<TAB>sha384-…` de cada arquivo.
3. Cole as linhas na seção `"integrity"`.
4. Abra `env-check.html` e confirme 8/8. Se a versão do three mudar, atualize também o `setDecoderPath` do Draco.
5. Propague o novo bloco para as páginas que usam 3D.

## Como adicionar modelos GLB/GLTF

1. No Blender: metros, Y para cima, transformações aplicadas, origem no centro da base. Nomeie peças e materiais configuráveis de forma semântica (`fachada-principal`, `esquadria-sala`, `opcional-piscina`, `mat-fachada`) — é por esses nomes que o código encontra cada peça.
2. Exporte `.glb` e otimize:
   ```bash
   npx @gltf-transform/cli optimize entrada.glb assets/3d/models/casa-base.glb --compress draco --texture-compress webp
   npx @gltf-transform/cli inspect assets/3d/models/casa-base.glb
   ```
3. Confira o orçamento (skill `webgl-performance`): ≤ 5 MB no celular, ≤ 100 draw calls, texturas ≤ 1024–2048 px.
4. Pastas: modelos em `assets/3d/models/`, texturas em `assets/3d/textures/`, HDRs em `assets/3d/hdr/`.
5. Nunca commite `.blend`, `.fbx` ou GLB sem otimizar.

## Experiência 3D (`experiencia-3d.html`)

Última etapa do "Novo projeto": `novo-projeto.html` (formulário em 4 etapas) → `experiencia-3d.html` → o projeto é criado com as escolhas do 3D em `project.experience` (normalizado em `backend/src/services/projectPreferences.js`). O assistente do arquiteto recebe isso como `experiencia3d` no contexto do projeto, então dá para perguntar "que piso o cliente escolheu na experiência 3D?".

Código em `assets/3d/configurator/`:

| arquivo | papel |
|---|---|
| `data/options.js` | catálogo: superfícies, materiais (com `styles`/`matchName` para o match), presets de clima, horários |
| `preferences.js` | estado central (desfazer/refazer), medidor de clima, frase viva, `toExperience()` (o que vai para o back-end) |
| `textures.js` / `materials.js` | texturas PBR reais (cor + relevo + AO/rugosidade, UV em metros) e o shader da onda radial que troca os três mapas |
| `daylight.js` / `scene.js` | hora do dia → sol, céu, luminárias, vista das janelas; HDR de interior, ACES, GTAO + bloom + MSAA com refinamento progressivo (quadro rápido em movimento, quadro completo quando a cena para) |
| `house.js` | casa montada (arquitetura + móveis em geometria macia + peças CC0 em GLB) **ou** `house.glb` (contrato de nomes abaixo); junta malhas por material |
| `camera.js` / `interaction.js` | vista geral que cabe na tela, mergulho nos ambientes, arrastar móveis, achar superfície sob o cursor |
| `ui.js` | painéis, bandeja com arrastar-e-soltar, sol no arco, etiquetas flutuantes, ferramentas, resumo "Seu projeto" |
| `main.js` / `page.js` | orquestra tudo / autenticação, rascunho (`sessionStorage`), criação do projeto, fallback sem WebGL2 |

- **Material novo**: um objeto em `MATERIALS` (`data/options.js`). `styles` só com o vocabulário de `PROJECT_STYLES` (`assets/js/data/project-styles.js`).
- **Superfície nova**: um objeto em `SURFACES` + o material da peça chamado `surf-<id>`.
- **Trocar a casa procedural por um GLB**: exporte seguindo o contrato — materiais configuráveis `surf-<id>`, móveis arrastáveis `movel-<id>` (com `userData.label`/`area`), luminárias `luz-<id>` — e acrescente `data-model="assets/3d/models/house.glb"` no `<main data-x3>` da página.
- **Testes**: `experiencia-3d.html?debug` expõe `window.__x3` e avança as animações mesmo com o painel do navegador escondido (sem isso o GSAP congela quando a aba não pinta).
- O import map da página é o canônico (`env-check.html`) + `RoundedBoxGeometry`, `gsap/CustomEase` e `gsap/utils/paths.js` (já acrescentados também ao `env-check.html`).

## Assets reais (texturas, modelos, HDR)

Tudo CC0 (Poly Haven e ambientCG) — lista em `assets/3d/CREDITS.md`. Os arquivos processados ficam no repositório; as fontes brutas, num cache fora dele. Para regenerar (Python com `numpy` + `opencv-python-headless`, Node para o `gltf-transform`):

```bash
python assets/3d/dev/fetch_sources.py <cache>/tex
python assets/3d/dev/build_textures.py <cache>/tex
python assets/3d/dev/fetch_models.py <cache>/models
bash assets/3d/dev/build_models.sh <cache>/models
python assets/3d/dev/fetch_environment.py
```

- `build_textures.py` leva cada foto até a cor do catálogo (mantendo a variação), gera o piso em tábuas a partir das lâminas de madeira, as miniaturas da interface e `configurator/data/textures.js` (tamanho físico, relevo, cor média). **Material novo** = uma linha em `MATERIALS` desse script + o objeto em `data/options.js`.
- Tamanho: ~9 MB de texturas (carregadas sob demanda, só as em uso), ~3,5 MB de modelos, 1,6 MB de HDR. Aparelho fraco pula as peças decorativas opcionais e o GTAO.
- O service worker (`sw.js`) não guarda os assets 3D (pesados demais para o cache do navegador do visitante).

## Skills do Claude Code criadas (`.claude/skills/`)

| skill | quando é usada |
|---|---|
| `threejs-architectural-visualizer` | qualquer cena 3D: renderer, câmera, luz, materiais, GLB/Draco, raycasting, estrutura de arquivos, ciclo de vida |
| `architectural-configurator` | catálogo de opções, estado → render, persistência por projeto, resumo/PDF, ponte com match e briefing |
| `webgl-performance` | orçamento, pipeline gltf-transform, instancing, sombras, render sob demanda, `dispose()`, aparelhos fracos, fallback |
| `premium-motion-design` | quando usar GSAP/Lenis vs. o motion que o site já tem; transições de câmera; motion reduzido |

Elas são específicas deste repositório (citam arquivos, tokens e padrões reais) e o Claude Code as carrega sozinho quando a tarefa combina com a descrição.

## MCPs

Nenhum MCP novo foi instalado — cada necessidade já está coberta:

| necessidade | como está coberta |
|---|---|
| Repositório / GitHub | `git` + `gh` CLI autenticado (conta `natanaelmgs04`, remoto `TCC---MatchAI`) |
| Navegador / testes visuais | navegador embutido do Claude Code desktop (navegar, clicar, console, rede, viewport celular, tema escuro) |
| Documentação atualizada | busca e leitura web do Claude Code (three.js, GSAP, Lenis, gltf-transform consultados nesta preparação) |

Se quiser os MCPs dedicados mesmo assim (ex.: usar o Claude Code no terminal, fora do app desktop), os comandos oficiais são:

```bash
claude mcp add playwright npx @playwright/mcp@latest
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```

O do GitHub pede login (OAuth) no primeiro uso.

## Conflitos conhecidos (pendentes de decisão)

1. ~~Service worker guardando tudo~~ — resolvido: o `sw.js` (cache `matchia-v2`) não guarda `assets/3d/`, `assets/audio/`, `.glb/.hdr/.mp3/.wasm` nem outros domínios.
2. ~~`no-store` em produção~~ — resolvido: em produção (`NODE_ENV=production`) fotos, 3D e áudio vão com cache de 1 dia; HTML/CSS/JS são revalidados (ETag). Se trocar um modelo mantendo o nome, o navegador pode levar até 1 dia para buscar o novo — prefira nome versionado (`casa-base.v2.glb`).
3. **`html { scroll-behavior: smooth }`** em `style.css` — se o Lenis for usado em alguma página, o `lenis.css` oficial resolve; não mexa no global.
4. O protótipo em `assets/3d/` usa three 0.184 e `PCFSoftShadowMap` (depreciado). Fica como está até decidirem aposentá-lo ou atualizá-lo.
