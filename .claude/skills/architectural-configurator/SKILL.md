---
name: architectural-configurator
description: Use ao construir ou mudar o configurador arquitetônico do match.IA — a experiência em que o cliente escolhe características de uma residência/projeto (fachada, esquadrias, cores, materiais, iluminação, paisagismo, elementos externos como piscina/pergolado/deck) e vê o resultado em 3D em tempo real. Cobre o catálogo de opções, o estado das escolhas, persistência por projeto, resumo final e a ponte com o match e o briefing. Para a cena 3D em si use threejs-architectural-visualizer; para custo de render use webgl-performance.
---

# Configurador arquitetônico — match.IA

O configurador existe para o cliente **descobrir e comunicar o que quer** antes de falar com um arquiteto — mesma missão da aba Assistente. Ele não é um orçamento nem um projeto executivo: nada de preço, metragem calculada ou promessa de obra. O produto final é um **conjunto de preferências** que alimenta o match e o briefing.

## Regra central: estado → render, nunca o contrário

```
UI (chips/botões) ──setChoice()──▶ state ──apply(state)──▶ cena 3D + UI + resumo
clique no 3D ───────setChoice()──┘
```

- Um único objeto de estado. Handlers de UI e de clique 3D **só** chamam `setChoice(categoria, opcaoId)`. Ninguém mexe em material/visibilidade direto de um handler.
- `apply(state)` é idempotente: rodar duas vezes com o mesmo estado dá a mesma cena. Isso torna "desfazer", "restaurar do localStorage" e "abrir link compartilhado" o mesmo caminho de código.
- Após `apply`, renderize **um** frame (render sob demanda — ver webgl-performance).

## Catálogo de opções como dados

`assets/3d/configurator/options.js` — o código lê o catálogo; adicionar uma opção nova **não** deve exigir mexer em lógica.

```js
export const CATEGORIES = [
  { id: 'fachada',     label: 'Fachada' },
  { id: 'esquadrias',  label: 'Esquadrias' },
  { id: 'cobertura',   label: 'Cobertura' },
  { id: 'iluminacao',  label: 'Iluminação' },
  { id: 'paisagismo',  label: 'Paisagismo' },
  { id: 'externos',    label: 'Elementos externos' },
];

export const OPTIONS = [
  {
    id: 'fachada-travertino', category: 'fachada', label: 'Travertino claro',
    kind: 'material',                 // material | color | visibility | variant | lighting
    targets: ['mat-fachada'],         // nomes de MATERIAL no GLB
    material: { color: 0xd8d2c4, roughness: 0.88 },
    thumb: 'assets/3d/textures/thumbs/travertino.webp',
    tags: { styles: ['Contemporâneo', 'Alto padrão'], materials: ['Travertino'] },
  },
  {
    id: 'piscina-sim', category: 'externos', label: 'Com piscina',
    kind: 'visibility', targets: ['opcional-piscina'], visible: true,
    tags: { materials: [] },
  },
  {
    id: 'luz-fim-de-tarde', category: 'iluminacao', label: 'Fim de tarde',
    kind: 'lighting', preset: { sunElevation: 12, sunAzimuth: 250, sunColor: 0xffc58a, exposure: 0.95 },
  },
];

export const DEFAULTS = { fachada: 'fachada-reboco', esquadrias: 'esquadria-grafite', /* ... */ };
```

Tipos de opção e como aplicar cada um:

| `kind` | o que faz | custo | quando usar |
|---|---|---|---|
| `material` | troca cor/roughness/textura do material nomeado | quase zero | revestimentos, pisos, cores de esquadria |
| `color` | só a cor, a partir de uma paleta | zero | pintura, metais |
| `visibility` | liga/desliga nós do GLB | zero por troca, ocupa memória | piscina, pergolado, deck, muros |
| `variant` | carrega outro GLB sob demanda e substitui o nó | download + memória | geometria realmente diferente (ex.: outro tipo de telhado) |
| `lighting` | preset de sol/exposição | zero | hora do dia, iluminação de fachada |

Prefira `material` > `visibility` > `variant`. Variantes pesadas: carregue na primeira escolha, guarde no cache de `loaders.js`, mostre um estado de carregamento no chip.

## Estado e persistência

- Escopo **por projeto** — igual ao assistente, que é sempre por `project._id`. O cliente já tem `myProjects` no painel; o configurador recebe o projeto escolhido.
- Chave no `localStorage`: `matchia_config_<projectId>`, com esquema versionado:
  ```js
  { v: 1, choices: { fachada: 'fachada-travertino', externos: ['piscina-sim'] }, updatedAt: '2026-…' }
  ```
- Ao ler: descarte ids que não existem mais no catálogo e complete o que faltar com `DEFAULTS`. Nunca quebre por causa de um estado antigo.
- `localStorage` pode falhar (aba anônima, cota): envolva leitura/escrita em `try/catch`, como o resto do site faz com `matchia_theme`.
- Salve com *debounce* (~400 ms) — não a cada movimento de um slider.
- Persistência no back-end (salvar no `Project`) é um passo posterior que precisa de rota nova em `backend/src/routes/projects.js`; **não** invente campo no schema sem pedido.
- Link compartilhável (opcional): serialize `choices` no hash (`#cfg=…` em base64url) e use o mesmo `apply()`.

## Ponte com o match e o briefing (o que torna isso útil para o produto)

O motor de match (`backend/src/services/scoringEngine.js`) pontua por sobreposição de `preferredStyles` e `preferredMaterials` do **projeto** com o portfólio do arquiteto. Por isso cada opção tem `tags`:

- `tags.styles` usa **exatamente** o vocabulário de `PROJECT_STYLES` em `assets/js/dashboard.js`: Moderno, Contemporâneo, Minimalista, Industrial, Clássico, Rústico, Escandinavo, Biofílico, Brutalista, Alto padrão. Não crie estilos novos sem atualizar essa lista.
- `tags.materials` usa nomes de material como os arquitetos cadastram (ex.: "Concreto aparente", "Madeira de demolição", "Vidro").
- O resumo final oferece **"Usar no meu projeto"**: soma as tags das escolhas e chama `MatchAPI.updateProject(projectId, { preferredStyles, preferredMaterials })` (rota já existe). Mostre o que vai mudar e peça confirmação antes de sobrescrever.

## Resumo final

- Agrupado por categoria, em português, com a miniatura de cada escolha. Texto, não só imagem — o resumo precisa ser lido sem o 3D.
- Exportar em PDF pelo mesmo mecanismo já usado em "Exportar PDF": preencher `#printableContent` em `dashboard.html` e chamar `window.print()` (ver `setupExportPdf` em `dashboard.js`). Inclua uma captura do canvas (`renderer.domElement.toDataURL('image/webp', 0.9)` logo após um `render()`).
- O resumo também pode virar contexto do assistente de IA do cliente — combine antes de mudar o prompt em `backend/src/services/geminiService.js`.

## UI e identidade

- Painéis em vidro fosco: `.dash-card` (anel de vidro líquido no `::before`). Opções como chips: `.chip-select .chip` / `.chip.active` (mesmo componente dos estilos do projeto em `#projStylesChips`), com `.chip.has-thumb` + `.chip-thumb` quando houver miniatura.
- Transições com os tokens `--ease-out` e `--ease-spring` de `style.css`. Nada de easing novo inventado.
- Overlay sobre o canvas: contêiner com `pointer-events: none`, só os controles com `pointer-events: auto`.
- Cada troca anuncia o resultado num `aria-live="polite"` ("Fachada: travertino claro").
- Botões "Desfazer" (pilha de estados anteriores, limite ~20) e "Restaurar padrão".
- No celular: cena em cima, opções numa faixa rolável embaixo; no desktop: opções na lateral. Nunca esconda opções só no 3D.

## Fluxo de dados resumido

```
main.js mount(host, { projectId, onApplyToProject })
  ├─ carrega options.js + modelo base (loaders.js)
  ├─ state = restore(projectId) ?? DEFAULTS
  ├─ apply(state) → 1 render
  ├─ UI ▸ setChoice() → apply() → saveDebounced() → anuncia
  └─ unmount() → salva, desmonta cena (dispose), remove listeners
```

## Não faça

- Não calcule preço, área ou prazo.
- Não replique as opções em dois lugares (HTML fixo + JS). O HTML das opções é gerado a partir de `OPTIONS`.
- Não salve estado por usuário em vez de por projeto.
- Não chame o back-end a cada clique.
