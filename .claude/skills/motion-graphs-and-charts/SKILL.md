---
name: motion-graphs-and-charts
description: Use ao criar gráficos e infográficos animados em vídeos do match.IA (workspace video/, Remotion) — score de compatibilidade, quebra por critério do match, barras, linhas, números animados, percentuais, indicadores, progress bars, diagramas de fluxo, mapas do Brasil e transições entre estados de dados. Garante dados reais do produto, paleta da marca e sincronia com a narração. Não use para gráficos do site (ver dataviz) nem para texto corrido (kinetic-typography).
---

# Gráficos e infográficos animados — match.IA

Um gráfico no vídeo tem **um** trabalho: tornar óbvia uma afirmação da narração. Se a pessoa precisa ler eixos para entender, ele não serve para vídeo.

## Quando usar

- Mostrar o score de compatibilidade e **por que** ele saiu daquele valor.
- Comparar arquitetos/categorias, mostrar um processo (diagrama), contar algo (números).
- Mapas de região de atendimento.

## Dados: só reais (ou rotulados como exemplo)

Use os dados que o produto realmente calcula — eles são o diferencial e são verificáveis pela banca:

**Quebra do score** (`backend/src/services/scoringEngine.js`, `scoreProjectToArchitect` → `breakdown`):

| critério | máximo |
|---|---|
| Estilo | 30 |
| Localização | 20 |
| Materiais | 15 |
| Especialidade | 15 |
| Disponibilidade | 10 |
| Experiência | 10 |
| Metragem | 5 |

**Categorias do resultado** (nenhum resultado some): melhor compatibilidade · indisponível no momento · fora da região · fora do orçamento · fora do estilo mas bem avaliado.

**Base de demonstração**: 10 arquitetos fictícios, 18 materiais. Números de mercado ou de "impacto" que não existem no projeto **não entram**. Exemplo inventado (ex.: "95% compatível") é permitido só se estiver claro que é um caso ilustrativo (mesmo valor que o vídeo da home já usa).

## Escolher a forma

| afirmação | forma |
|---|---|
| "X% compatível" | **anel** (ring) com número no centro |
| por que deu X | **barras horizontais** por critério, preenchidas até `valor/máximo`, ordenadas pelo peso |
| comparar 2–4 arquitetos | barras agrupadas ou "slope" entre dois estados |
| evolução no tempo | linha que se desenha |
| etapas (projeto → match → contratação) | diagrama de nós ligados por traço |
| onde atende | mapa do Brasil com UFs destacadas |
| um número forte | contador grande + rótulo (sem gráfico) |

Pizza e 3D: não. Mais de 7 barras: divida em duas cenas.

## Paleta e marcação

- Valor principal / destaque: **terracota** `#B0755A`. Base, trilho, valores secundários: **sálvia** `#7B8E7E` ou `color.bgAlt`.
- Cliente = sálvia, arquiteto = terracota (mesma regra de direção de tela das outras skills).
- Trilho (fundo da barra/anel): `color.bgAlt`; grade, se precisar: `color.line`, 1 px.
- Texto de gráfico: Inter, `tabular-nums`, rótulos ≥ 26 px, valor ≥ 36 px.
- Rotule direto na marca (valor no fim da barra), não em legenda separada.
- Cantos arredondados com `radius` de `tokens.ts`; barras com ponta arredondada (`borderRadius: 99`).

## Padrões de animação (Remotion)

Todos dirigidos por `useCurrentFrame()` + `interpolate()` com `ease.out`. Gráfico entra em **três tempos**: estrutura (trilho/eixo, 8–10 q) → dados (barras/linha, 18–30 q, stagger 2–3 q) → rótulos e número (fade 8 q quando o dado chega).

### Número animado

```tsx
const fmt = new Intl.NumberFormat("pt-BR"); // 1.234 / 95
const p = interpolate(frame, [at, at + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.out });
const value = Math.round(target * p);
<span style={{ fontFamily: font.body, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt.format(value)}%</span>
```

O número **termina antes** de a narração dizê-lo (4–8 q). Para valores com casa decimal, arredonde para a casa final só no último quadro.

### Anel de compatibilidade

```tsx
const R = 88, C = 2 * Math.PI * R;
<svg viewBox="0 0 200 200" width={360}>
  <circle cx={100} cy={100} r={R} fill="none" stroke={color.bgAlt} strokeWidth={14} />
  <circle cx={100} cy={100} r={R} fill="none" stroke={color.terracotta} strokeWidth={14} strokeLinecap="round"
    strokeDasharray={C} strokeDashoffset={C * (1 - 0.95 * p)} style={{ rotate: "-90deg", transformOrigin: "50% 50%" }} />
</svg>
```

### Barras da quebra do score

Largura = `(valor / máximo) * p_i`, onde `p_i` é o progresso da barra i com atraso `i * 3` quadros. Valor numérico aparece no fim da barra quando `p_i > 0.85`.

### Linha que se desenha

Use `@remotion/paths` (instalado): `evolvePath(progress, d)` devolve `strokeDasharray`/`strokeDashoffset`. Pontos (marcadores) aparecem quando a linha passa por eles (`getPointAtLength`).

### Diagrama de fluxo

Nós (cards de vidro) entram com `ease.out`; o traço entre eles se desenha com `evolvePath` **depois** que o nó de origem parou; o nó de destino entra quando o traço chega. Traço fino (2 px), cor `color.ink` a 40% — estética de prancha de arquitetura.

### Transição entre estados

Para mostrar "antes → depois" (ex.: score de um arquiteto genérico vs. o do match), interpole cada barra do valor antigo ao novo **mantendo a identidade** (mesma barra, mesmo lugar). Itens que entram/saem fazem fade + 6 px de deslocamento; os que permanecem só mudam de tamanho/posição.

### Mapa do Brasil

SVG simples por UF (sem tiles, sem chave de API). Fonte de geometria: malha pública do IBGE, simplificada (ex.: mapshaper) e salva em `video/src/data/brasil-ufs.json` — registre a fonte em comentário. UFs atendidas acendem em sálvia uma a uma (stagger 2 q); a UF da obra pulsa **uma vez** em terracota. A skill oficial `remotion-maps` (MapTiler/Cesium) exige chave de API — só se o vídeo realmente precisar de mapa real.

## Erros a evitar

- Gráfico genérico de template (pizza colorida, barras 3D, eixos cheios de números).
- Dados inventados apresentados como reais; % sem base.
- Todas as barras crescendo juntas, linear, sem hierarquia.
- Número contando até o fim **depois** de a narração já ter falado o valor.
- Legenda separada que obriga o olho a ir e voltar.
- Cores fora da paleta (vermelho/verde de "bom/ruim").
- Texto de gráfico < 26 px ou números sem `tabular-nums`.

## Checklist

- [ ] Uma afirmação por gráfico, dita na narração.
- [ ] Dados reais do produto (ou claramente ilustrativos).
- [ ] Forma escolhida pela tabela; ≤ 7 itens.
- [ ] Estrutura → dados → rótulos, com `ease.out` e stagger.
- [ ] Terracota = destaque, sálvia/bege = base; rótulo direto.
- [ ] Número fecha 4–8 q antes da fala.
- [ ] Hold ≥ 1,2 s com o gráfico completo e parado.
