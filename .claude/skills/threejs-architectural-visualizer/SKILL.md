---
name: threejs-architectural-visualizer
description: Use ao criar ou alterar qualquer cena 3D no match.IA com Three.js — visualização de residências/projetos, carregamento de modelos GLB/GLTF (inclusive Draco), câmeras, iluminação, materiais arquitetônicos, texturas, raycasting/seleção de objetos e organização modular do código 3D. Também ao embutir um canvas WebGL no painel (dashboard.html) ou numa página do site. Não use para animações de interface sem 3D (ver premium-motion-design) nem para a lógica de opções do configurador (ver architectural-configurator).
---

# Three.js — visualização arquitetônica no match.IA

O site é **HTML/CSS/JS vanilla, sem bundler**. O Express (`backend/src/server.js`) serve a raiz do projeto como arquivos estáticos. Nada de React, R3F, Vite ou Next. Toda biblioteca de front-end entra por **import map + CDN com SRI**, nunca por `node_modules`.

## Fatos do projeto que você precisa saber antes de escrever código

- **Import map canônico**: `assets/3d/dev/env-check.html`. É a fonte da verdade (three r186.1, addons, gsap, lenis, lil-gui, todos com hash `sha384`). Copie o bloco `<script type="importmap">` **inteiro** para o `<head>` da página, antes de qualquer `<script type="module">`. Abra `http://localhost:3000/assets/3d/dev/env-check.html` para confirmar que tudo carrega (`window.__envCheck.ok === true`).
- **Import maps precisam ser inline.** `<script type="importmap" src>` não é suportado de forma ampla — não tente externalizar.
- **Addon fora do mapa de integridade**: o prefixo `"three/addons/"` resolve qualquer arquivo de `examples/jsm/`, mas só os listados em `"integrity"` têm SRI. Ao usar um addon novo, gere o hash (ver `3D-SETUP.md`, seção "Atualizar versões") e acrescente a entrada — incluindo os imports relativos que ele puxar (ex.: `GLTFLoader` puxa `utils/BufferGeometryUtils.js` e `utils/SkeletonUtils.js`).
- **Protótipo existente**: `assets/3d/mansion-3d.html` + `assets/3d/three-d-stage.js` (web component `<three-d-stage>`, three **0.184.0**, não linkado por nenhuma página). Serve de referência de paleta e modelagem procedural, **mas não copie dele**: usa `PCFSoftShadowMap` (depreciado desde r182) e renderiza todo frame. Não altere esses arquivos sem pedido explícito.
- **Precedente de 3D embutido no painel**: `initSpline()` em `assets/js/assistente.js`. Ele já resolve, do jeito que o projeto espera:
  - só carrega se `window.WebGL2RenderingContext` existe;
  - `import()` dinâmico do runtime a partir de um script clássico;
  - dimensiona o canvas via CSS **antes** de criar o renderer, depois `setSize` + `ResizeObserver`;
  - pausa com `IntersectionObserver` + `visibilitychange`;
  - em qualquer falha, remove o canvas e o site continua funcionando (degradação graciosa é política do projeto).
- **Lição do bug do robô** (`.ai-shell`): elemento transparente por cima do canvas com `pointer-events: auto` engole todos os eventos do mouse. Qualquer overlay de UI sobre a cena: `pointer-events: none` no contêiner e `auto` só nos controles clicáveis.
- `dashboard.js` é **script clássico** (não é módulo). Ele não pode usar `import` estático, mas pode chamar `import('/assets/3d/configurator/main.js')` — o import dinâmico respeita o import map da página. Use isso para carregar o 3D só quando a aba for aberta.

## Estrutura de arquivos recomendada

```
assets/3d/
├── dev/env-check.html        # import map canônico + teste do ambiente
├── models/                   # .glb otimizados (Draco), nomes em kebab-case
├── textures/                 # .webp/.ktx2, potência de 2, ≤ 2048px
├── hdr/                      # .hdr opcionais (iluminação de ambiente real)
└── configurator/             # código do configurador (ES modules)
    ├── main.js               # mount(host, opts) / unmount() — única porta de entrada
    ├── scene.js              # renderer, câmera, luzes, ambiente, loop sob demanda
    ├── loaders.js            # GLTFLoader + DRACOLoader compartilhados, cache por URL
    ├── materials.js          # biblioteca de materiais por id de opção
    └── picking.js            # raycasting contra lista branca de objetos
```

Um módulo, uma responsabilidade. `main.js` é o único que o resto do site conhece; ele devolve `{ unmount }`.

## Renderer (r186)

```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowEnd ? 1 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;      // já é o padrão; deixe explícito
renderer.toneMapping = THREE.NeutralToneMapping;       // fidelidade de cor de material (escolha de cliente)
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !lowEnd;
renderer.shadowMap.type = THREE.PCFShadowMap;          // PCFSoftShadowMap está depreciado (r182); PCF já é suave
```

- `NeutralToneMapping` para o configurador (a cor que o cliente escolhe precisa parecer a cor real). `ACESFilmicToneMapping` só para cenas "de vitrine" onde contraste dramático importa mais que fidelidade.
- Use `THREE.Timer` em vez de `THREE.Clock` (depreciado em r183).
- `alpha: true` + fundo transparente quando a cena fica sobre o vidro fosco do site; caso contrário `scene.background` com a cor do tema.

## Ambiente e luz

- **Padrão: `RoomEnvironment` via PMREM** — iluminação de estúdio sem baixar nada.
  ```js
  import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  ```
- HDRI real (luz de céu externa): `HDRLoader` (`RGBELoader` agora é só um alias depreciado). Use `.hdr` de 1k/2k, nunca 4k+ na web.
- Exterior: 1 `DirectionalLight` (sol) com sombra + ambiente. Interior: ambiente + 1–2 luzes pontuais sem sombra. Nunca mais de **uma** luz projetando sombra.
- Sombra do sol: enquadre a `shadow.camera` no bounding box do modelo (o protótipo usa `sphere.radius * 3`), `mapSize` 2048 desktop / 1024 celular, `shadow.bias` pequeno (≈ −0.0002) e `normalBias` ≈ 0.02 contra *acne*.

## Câmera para arquitetura

- `PerspectiveCamera` com **fov 35–45°** (menos distorção de verticais). Unidades em **metros**, **y para cima** (padrão glTF).
- Vista externa: alvo no centro do volume, câmera em altura de olho humano (~1.6 m) ou vista aérea 3/4. Mantenha a câmera nivelada quando quiser verticais retas.
- `OrbitControls` com limites — o cliente não deve ir para baixo do terreno nem perder o modelo:
  ```js
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;   // não passa do chão
  controls.minDistance = 4; controls.maxDistance = 40;
  controls.enablePan = false;                // no celular, pan confunde mais do que ajuda
  ```
- Enquadramento automático pelo bounding sphere (ver `setObject()` em `three-d-stage.js`) e ajuste de `near/far` proporcional à distância.

## Materiais com a identidade do site

Cores da marca (de `:root` em `assets/css/style.css`): terracota `#B0755A`, terracota escura (`--terracotta-dark`), sálvia `#7B8E7E`, fundo `#FAF9F6`, fundo alternativo `#EEE3DA`, tinta `#333333`. Paleta arquitetônica já usada no protótipo:

| id | material | cor | roughness | metalness |
|---|---|---|---|---|
| `travertino` | `MeshStandardMaterial` | `0xd8d2c4` | 0.88 | 0 |
| `madeira-ripada` | `MeshStandardMaterial` | `0x6b4a30` | 0.55 | 0 |
| `reboco-off-white` | `MeshStandardMaterial` | `0xefece3` | 0.82 | 0 |
| `metal-grafite` | `MeshStandardMaterial` | `0x2b2b2c` | 0.4 | 0.35 |
| `vidro` | `MeshPhysicalMaterial` | `0xbfd6dd` | 0.05 | 0.1 + `transmission` |

- Metal sem ambiente fica preto: com `scene.environment` definido pode subir `metalness`; sem ele, limite a ~0.35.
- Vidro: `MeshPhysicalMaterial` com `transmission`/`thickness` só em desktop; no celular troque por `transparent: true, opacity: 0.3` (transmission custa uma passada extra de render).
- **Uma instância de material por superfície configurável**, nomeada (`material.name = 'fachada'`), para o configurador trocar cor/textura sem afetar outras peças.
- Texturas de cor (`map`) em `SRGBColorSpace`; normal/roughness/AO em `NoColorSpace` (linear). Ao criar `Texture` à mão, defina `colorSpace` sempre.

## Modelos GLB/GLTF

```js
// loaders.js — um par de loaders para a página inteira
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.186.1/examples/jsm/libs/draco/gltf/');
export const gltfLoader = new GLTFLoader().setDRACOLoader(draco);

const cache = new Map();
export function loadModel(url) {
  if (!cache.has(url)) cache.set(url, gltfLoader.loadAsync(url));
  return cache.get(url);                     // mesma promessa para chamadas repetidas
}
```

- O caminho do decodificador Draco **precisa casar com a versão do three** do import map. Não use `setDecoderConfig` (depreciado em r186 — sempre WASM).
- Convenção de nomes no Blender, para o código achar as peças com `getObjectByName`:
  `fachada-principal`, `esquadria-sala`, `cobertura`, `piso-externo`, `paisagismo-*`, `opcional-piscina`, `opcional-pergolado`. Materiais: `mat-fachada`, `mat-esquadria`… Nada de `Cube.003`.
- Exporte em metros, origem no centro da base do terreno, transformações aplicadas (Ctrl+A no Blender).
- Antes de commitar um `.glb`, passe pelo pipeline da skill **webgl-performance**.

## Raycasting / seleção

```js
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pickables = [];                         // só as peças configuráveis, nunca scene.children inteiro

function pick(event) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(pickables, false)[0]?.object ?? null;
}
renderer.domElement.addEventListener('pointerup', (e) => { if (!wasDrag(e)) onSelect(pick(e)); });
```

- Use `pointerup` com teste de arrasto (distância < 5 px desde `pointerdown`) para não selecionar ao girar a câmera.
- Hover: no máximo um raycast por frame (marque uma flag no `pointermove` e resolva no loop).
- **Toda ação feita clicando no 3D precisa existir também como botão na UI** (teclado, leitor de tela, celular). O 3D é atalho, não o único caminho.

## Tema claro/escuro

O tema vem de `document.documentElement.dataset.theme` (`light`/`dark`, ou ausente = `prefers-color-scheme`). Observe mudanças e ajuste fundo/exposição:

```js
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

## Ciclo de vida (obrigatório)

`mount()` cria; `unmount()` desfaz **tudo**: `renderer.setAnimationLoop(null)`, observers desconectados, listeners removidos, `geometry.dispose()`, `material.dispose()`, cada textura dos materiais `.dispose()`, `scene.environment?.dispose()`, `renderer.dispose()`. Desde r186 `Object3D` tem `dispose()` — se criar classe 3D própria com `dispose()`, chame `super.dispose()`. Detalhes em **webgl-performance**.

## Checklist antes de dizer que está pronto

- [ ] Página abre sem erro no console; `env-check.html` continua 8/8.
- [ ] Sem WebGL2 → fallback estático visível, resto da página intacto.
- [ ] Canvas redimensiona com a janela e com a sidebar do painel (ResizeObserver).
- [ ] Nenhum overlay bloqueando o mouse no canvas.
- [ ] Testado em 375 px (celular) e desktop, tema claro e escuro, via ferramentas de navegador da sessão.
