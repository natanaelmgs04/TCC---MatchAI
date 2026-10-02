---
name: webgl-performance
description: Use ao otimizar ou revisar desempenho de qualquer cena Three.js/WebGL do match.IA — tamanho e compressão de GLB (Draco, gltf-transform), texturas, draw calls, instancing, sombras, render sob demanda, pausa fora da tela, liberação de memória com dispose(), qualidade adaptativa para celular e fallback para aparelhos fracos ou sem WebGL2. Use também antes de commitar qualquer modelo 3D novo e quando o FPS cair.
---

# Desempenho WebGL — match.IA

Público real do match.IA: cliente final no **celular**, muitas vezes com bateria e 4G limitados. Uma cena arquitetônica é quase sempre **estática** — gaste GPU só quando algo muda.

## Orçamento por cena (alvo)

| métrica | celular | desktop |
|---|---|---|
| draw calls (`renderer.info.render.calls`) | ≤ 100 | ≤ 250 |
| triângulos visíveis | ≤ 300 k | ≤ 1 M |
| maior textura | 1024 px | 2048 px |
| GLB base (já comprimido) | ≤ 5 MB | ≤ 8 MB |
| pixel ratio | 1–1.5 | ≤ 2 |
| FPS durante interação | 30 estável | 60 |

Meça, não chute: em dev, mostre `renderer.info` num painel `lil-gui` (o import map já tem `lil-gui`; nunca o carregue em produção).

## Pipeline de modelos (antes de commitar qualquer `.glb`)

```bash
npx @gltf-transform/cli inspect entrada.glb
npx @gltf-transform/cli optimize entrada.glb assets/3d/models/casa-base.glb --compress draco --texture-compress webp
npx @gltf-transform/cli inspect assets/3d/models/casa-base.glb
```

- `optimize` já deduplica, junta malhas compatíveis, cria instâncias e redimensiona texturas. Confira no `inspect` final: contagem de draw calls, tamanho das texturas, presença de `KHR_draco_mesh_compression`.
- `--compress meshopt` é alternativa ao Draco (descompressão mais leve), mas exige `MeshoptDecoder` no `GLTFLoader` e uma entrada nova no import map — Draco já está configurado e testado (`assets/3d/dev/env-check.html`).
- KTX2/Basis (`etc1s`/`uastc`) reduz memória de GPU de verdade, mas depende do KTX-Software instalado na máquina para gerar e do `KTX2Loader` + transcodificador no navegador (chamar `detectSupport(renderer)` depois de criar o renderer). Só vale quando a cena tiver muitas texturas grandes.
- Nunca commite `.blend`, `.fbx` ou GLB não otimizado em `assets/`.

## Draw calls e geometria

- **Instancing** para o que se repete: árvores, arbustos, postes de cerca, réguas de deck, luminárias externas → `THREE.InstancedMesh` (uma chamada para N cópias). Para muitas geometrias diferentes com o mesmo material → `THREE.BatchedMesh`.
- Peças estáticas que **não** são configuráveis nem clicáveis: junte com `mergeGeometries` (`three/addons/utils/BufferGeometryUtils.js`, já no mapa de integridade).
- Peças configuráveis ficam separadas (o configurador precisa trocar o material delas) — é o preço da interatividade; mantenha poucas.
- *Frustum culling* já vem ligado; não desligue `frustumCulled`. Se um objeto some nas bordas da tela, o problema é bounding sphere errado (`geometry.computeBoundingSphere()`), não o culling.
- Paisagismo distante: LOD simples (`THREE.LOD`) ou impostor (plano com textura) a partir de ~30 m.

## Sombras

- No máximo **uma** luz com sombra (o sol).
- Cena estática: calcule a sombra uma vez e reaproveite.
  ```js
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;      // chame de novo só quando o configurador mudar algo que projeta sombra
  ```
- `PCFShadowMap` (o `PCFSoftShadowMap` está depreciado). `mapSize` 1024 no celular, 2048 no desktop. Enquadre a câmera de sombra no modelo — área grande = sombra borrada e cara.
- Aparelho fraco: sem sombra em tempo real; use um plano com textura de sombra de contato pré-renderizada.

## Render sob demanda (o maior ganho)

```js
let needsRender = true;
const requestRender = () => { needsRender = true; };
controls.addEventListener('change', requestRender);   // OrbitControls com damping dispara 'change' enquanto desacelera
renderer.setAnimationLoop(() => {
  controls.update();                                 // necessário para o damping
  if (!needsRender) return;
  needsRender = false;
  renderer.render(scene, camera);
});
// configurador: apply(state) → requestRender(); tween GSAP → onUpdate: requestRender
```

Não renderize 60 vezes por segundo uma cena parada (o protótipo `three-d-stage.js` faz isso — não copie).

## Pausar fora da tela

Mesmo padrão já usado no projeto (`initSpline` em `assets/js/assistente.js`):

```js
let visible = true;
const sync = () => renderer.setAnimationLoop(visible && !document.hidden ? loop : null);
new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(host);
document.addEventListener('visibilitychange', sync);
```

No painel, a aba do configurador escondida (`hidden`) também tem que parar o loop.

## Qualidade adaptativa e fallback

```js
const webgl2 = !!document.createElement('canvas').getContext('webgl2');
const lowEnd =
  (navigator.hardwareConcurrency || 8) <= 4 ||
  (navigator.deviceMemory || 8) <= 4 ||
  matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 500;
```

- `!webgl2` → **não** carregue three. Mostre imagem estática do modelo (render pré-gerado em `.webp`) + as opções em lista; o resumo continua funcionando. É o mesmo princípio de degradação do resto do site.
- `lowEnd` → `pixelRatio = 1`, `antialias: false`, sem sombra em tempo real, vidro sem `transmission`, ambiente RoomEnvironment em vez de HDR.
- Queda de FPS sustentada (média < 24 por ~2 s durante interação) → baixe o pixel ratio em degraus de 0.25 até 1. Nunca suba de volta no meio da interação (causa "pulsar").
- **`prefers-reduced-motion` NÃO desliga o configurador.** Ao contrário do robô decorativo da aba Assistente (que nem carrega nesse caso), o configurador é funcional. Com motion reduzido: sem auto-rotação, transições de câmera instantâneas, sem damping exagerado.

## Carregamento preguiçoso

- three só carrega quando o usuário abre o configurador: `import('/assets/3d/configurator/main.js')` a partir do clique/aba (funciona até em script clássico como `dashboard.js`).
- Mostre o modelo base primeiro; variantes (`kind: 'variant'`) só quando escolhidas.
- Texturas de opções não escolhidas: não baixe todas de uma vez; pré-carregue a do chip em `pointerenter` (desktop).

## Memória — `dispose()` sempre

GPU não tem coletor de lixo. Ao desmontar ou ao trocar uma variante:

```js
function disposeObject(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}
// unmount: disposeObject(scene); scene.environment?.dispose(); renderer.dispose(); renderer.forceContextLoss();
```

- Texturas compartilhadas por várias opções: mantenha um cache com contagem de uso; só `dispose()` quando ninguém mais usa.
- `DRACOLoader.dispose()` encerra os workers — chame depois que todos os modelos da tela foram carregados.
- Desde r186 `Object3D` tem `dispose()`; classes próprias devem chamar `super.dispose()`.
- Em dev, confira `renderer.info.memory.geometries/textures` antes e depois de trocar variantes 10 vezes — o número tem que estabilizar.

## Conflitos já conhecidos neste projeto

1. **Service worker (`sw.js`)** guarda toda resposta GET no cache `matchia-v1`, sem limite e sem expirar — incluindo CDN e futuros `.glb`/texturas de vários MB. Antes de publicar modelos, excluir do cache do SW extensões `glb|gltf|bin|hdr|ktx2|wasm` (ou criar cache próprio com limite). Mudança no SW precisa de aprovação.
2. **Express envia `Cache-Control: no-store` para todo arquivo estático** (`backend/src/server.js`), em dev **e** em produção (Render usa o mesmo servidor). Para modelos isso significa baixar tudo de novo a cada visita. Para produção: servir `assets/3d/models` e `assets/3d/textures` com cache longo + nome de arquivo versionado (`casa-base.v2.glb`). Mudança no servidor precisa de aprovação.
3. `html { scroll-behavior: smooth }` em `style.css` — irrelevante para WebGL, mas veja premium-motion-design se for usar Lenis.

## Checklist de revisão

- [ ] `inspect` do GLB final dentro do orçamento.
- [ ] Render sob demanda; zero frames quando parado (confira com o painel de desempenho do navegador).
- [ ] Loop para quando a aba/elemento sai da tela.
- [ ] `renderer.info.memory` estável após trocar opções repetidamente.
- [ ] Testado com viewport 375 px e com `lowEnd` forçado.
- [ ] Sem WebGL2: fallback visível, sem erro no console.
