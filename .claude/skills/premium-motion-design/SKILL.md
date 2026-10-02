---
name: premium-motion-design
description: Use ao criar animações, transições e microinterações premium no match.IA — transições de câmera 3D, troca de estado no configurador, reveals, parallax, coreografias com GSAP/ScrollTrigger e rolagem suave com Lenis. Diz quando usar GSAP/Lenis e quando o sistema de motion que o site já tem (CSS + assets/js/site.js) basta. Use antes de adicionar qualquer animação nova para não duplicar o que existe.
---

# Motion design premium — match.IA

Motion aqui serve à leitura de um espaço arquitetônico: lento o bastante para parecer intencional, rápido o bastante para não atrapalhar. **Sem exageros** foi decisão explícita do projeto.

## O que o site já tem (não reimplemente)

- **Tokens de easing** em `:root` (`assets/css/style.css`) — só dois, de propósito:
  - `--ease-out: cubic-bezier(.2, .8, .2, 1)` → entradas, reveals, painéis.
  - `--ease-spring: cubic-bezier(.34, 1.56, .64, 1)` → só microinterações pequenas (botões, chips, ícones).
- **`assets/js/site.js`**: reveal com `IntersectionObserver` (`.reveal` e `[data-stagger]` com atraso por filho), parallax do hero e de fundos com `requestAnimationFrame`, seção com pin horizontal (só desktop, `pointer: fine`, sem motion reduzido) e contadores animados.
- **View Transitions** entre páginas (`@view-transition { navigation: auto; }`), desligadas com motion reduzido.
- **Motion reduzido** tratado globalmente em `style.css` e em cada efeito de `site.js` (`matchMedia('(prefers-reduced-motion: reduce)')`).
- `:active` com leve `scale` nos botões; hovers de card com `translateY(-1px)`.

Se o efeito que você quer é um destes, use o existente (classe/atributo). GSAP não entra para fazer reveal de card.

## Quando GSAP entra

GSAP (3.15, gratuito inclusive para uso comercial e com todos os plugins desde 2025) é para o que CSS não alcança:

1. **Câmera 3D** — interpolar `camera.position` e `controls.target` juntos.
2. **Valores dentro do WebGL** — cor de material, exposição, posição do sol ao trocar preset de iluminação.
3. **Sequências coreografadas** com várias etapas dependentes (timeline), ex.: intro do configurador.
4. **Animação ligada à rolagem** numa página de storytelling 3D dedicada (ScrollTrigger).

```js
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);
```

### Easing igual ao do site

Para manter a mesma "assinatura" do CSS, use o `CustomEase` com a curva exata do token:

```js
import { CustomEase } from 'gsap/CustomEase';      // adicionar ao import map + hash antes (ver 3D-SETUP.md)
gsap.registerPlugin(CustomEase);
CustomEase.create('matchOut', '.2,.8,.2,1');        // = --ease-out
CustomEase.create('matchSpring', '.34,1.56,.64,1'); // = --ease-spring (só em coisas pequenas)
```

Enquanto `CustomEase` não estiver no import map, `power3.out` é a aproximação aceitável de `--ease-out`. Nunca use `bounce`/`elastic` em câmera ou em elementos grandes.

### Durações

| o quê | duração |
|---|---|
| hover / clique | 150–200 ms (CSS, não GSAP) |
| reveal / painel | 450–600 ms |
| atraso entre itens (stagger) | 60–80 ms |
| troca de material/cor no 3D | 350–500 ms |
| movimento de câmera entre vistas | 0.9–1.4 s |
| intro completa do configurador | ≤ 2.5 s, e pode ser pulada |

### Transição de câmera (padrão do projeto)

```js
function flyTo({ position, target }, { duration = 1.2 } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  gsap.killTweensOf([camera.position, controls.target]);
  if (reduce) { camera.position.copy(position); controls.target.copy(target); controls.update(); requestRender(); return; }
  controls.enabled = false;
  gsap.timeline({ defaults: { duration, ease: 'matchOut' }, onUpdate: () => { controls.update(); requestRender(); }, onComplete: () => { controls.enabled = true; } })
    .to(camera.position, { x: position.x, y: position.y, z: position.z }, 0)
    .to(controls.target, { x: target.x, y: target.y, z: target.z }, 0);
}
```

- Posição e alvo **sempre** juntos, no mesmo timeline — senão a câmera "torce".
- Desabilite os controles durante o voo; o usuário pode interromper (chame `gsap.killTweensOf` no `pointerdown`).
- Chame `requestRender()` no `onUpdate` (render sob demanda — ver webgl-performance).

### Troca de cor de material

```js
const to = new THREE.Color(option.material.color);
gsap.to(material.color, { r: to.r, g: to.g, b: to.b, duration: 0.4, ease: 'matchOut', onUpdate: requestRender });
```

Texturas não interpolam: troque a textura com um *crossfade* curto de exposição ou simplesmente troque (≤ 1 frame) — não invente dissolve de shader para isso.

### Motion reduzido e breakpoints

```js
const mm = gsap.matchMedia();
mm.add({ reduce: '(prefers-reduced-motion: reduce)', desktop: '(min-width: 1024px)' }, (ctx) => {
  const { reduce, desktop } = ctx.conditions;
  // reduce: duração 0, sem parallax, sem auto-rotação
  // tudo criado aqui (tweens e ScrollTriggers) é revertido sozinho quando a condição muda — não chame revert manualmente aqui
});
```

Use `gsap.matchMedia()` (ou `gsap.context()`) em todo módulo que anima e chame `mm.revert()` no `unmount()` do configurador.

## Lenis (rolagem suave) — use com muito critério

- **Não aplique Lenis no painel (`dashboard.html`).** Ele está cheio de rolagens internas (`.ai-thread`, `.ai-picker`, gaveta de projetos, lista de conversas, chat) que precisariam de `data-lenis-prevent` uma a uma, e o ganho é nulo num app de trabalho.
- Use só numa página de experiência/storytelling 3D dedicada, se ela existir.
- `style.css` define `html { scroll-behavior: smooth; }`. Inclua sempre o CSS oficial do Lenis — ele sobrescreve isso enquanto o Lenis está ativo:
  ```html
  <link rel="stylesheet" href="https://unpkg.com/lenis@1.3.26/dist/lenis.css">
  ```
- Lenis já respeita `prefers-reduced-motion` por padrão (`respectReducedMotion: true`) — não desligue.
- Integração oficial com ScrollTrigger (um único relógio, o do GSAP):
  ```js
  import Lenis from 'lenis';
  const lenis = new Lenis({ anchors: true, allowNestedScroll: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  ```
  Com essa integração **não** use `autoRaf: true` (seriam dois loops).
- Elementos com rolagem própria dentro da página: `data-lenis-prevent`.
- Os efeitos de `site.js` continuam funcionando com Lenis (ele move a rolagem nativa, então `scroll`/`IntersectionObserver` seguem disparando). Não crie um ScrollTrigger que faça o mesmo pin/parallax de uma seção que `site.js` já anima.

## ScrollTrigger

- Um `ScrollTrigger` por cena/seção, não por elemento.
- `scrub: true` (ou `scrub: 0.5`) para câmera ligada à rolagem; nunca prenda o usuário (scroll-jacking) por mais de ~1.5 altura de tela.
- Depois de carregar o GLB ou mudar layout, `ScrollTrigger.refresh()`.
- `markers: true` só em dev.

## Antipadrões (evite)

- Auto-rotação que continua depois que o usuário mexeu na câmera.
- Câmera passando por dentro de paredes no voo (defina pontos de vista seguros e voe entre eles).
- Parallax em tudo; efeito em toda seção.
- Texto que aparece letra por letra em título funcional.
- Animação bloqueando a ação (o clique precisa funcionar durante a transição).
- Qualquer coisa que pareça "site gerado por IA": gradientes roxos, glow pulsando, contadores em tudo.

## Checklist

- [ ] O efeito não existia já em CSS/`site.js`.
- [ ] Easing = token do site (`matchOut`/`--ease-out`), duração dentro da tabela.
- [ ] Com `prefers-reduced-motion: reduce` tudo funciona e nada se move sozinho.
- [ ] `unmount()` reverte tudo (`mm.revert()`, `lenis.destroy()`, `ScrollTrigger.getAll()` do módulo mortos).
- [ ] Interação continua possível durante a animação.
