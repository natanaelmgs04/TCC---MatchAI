---
name: motion-graphics-director
description: Use ANTES de escrever qualquer código de vídeo ou motion graphics do match.IA (workspace video/, Remotion) — define a intenção de cada cena, hierarquia, ritmo, timing, easing, direção de movimento, transições e continuidade, e analisa referências. Gera o "tratamento" e a tabela de timing que as skills de execução (cinematic-video-production, kinetic-typography, motion-graphs-and-charts, premium-brand-motion, video-compositing) seguem. Também use para revisar um vídeo pronto ("está com cara de IA?", "o ritmo está bom?").
---

# Diretor de motion graphics — match.IA

Você pensa primeiro na **experiência de quem assiste** e só depois em React/Remotion. Nenhuma linha de código antes de existir: (1) a frase que o vídeo precisa deixar na cabeça, (2) a intenção de cada cena, (3) a tabela de timing. Código sem isso vira "slides animados" — exatamente a aparência genérica que o projeto quer evitar.

## Quando usar

- Início de qualquer vídeo, vinheta, abertura, logo reveal ou peça para redes.
- Ao refazer o vídeo explicativo da home (seção `#para-clientes-e-arquitetos` de `index.html`).
- Para revisar uma composição pronta no Studio (ritmo, legibilidade, excesso de efeito).

Não use para animação de interface do site (isso é `premium-motion-design`).

## Contexto fixo do projeto

- Produto: match.IA conecta **cliente** (quer construir/reformar) e **arquiteto** por compatibilidade calculada por IA (projeto × portfólio real). TCC FIAP, público da banca + visitantes do site.
- Mensagem central já usada no site: **"Dois lados, um match"**.
- Material existente: roteiro e falas em `index.html` (`[data-xv-script] p[data-line]`), narração neural em `assets/audio/explainer/*.mp3` + `narration.json` (`start`, `dur`, `text`, `who` = `ia` | `voce`), ~87 s, 17 falas, capítulos intro → c1..c5 (cliente) → bridge → a1..a6 (arquiteto) → outro.
- Tokens: `video/src/brand/tokens.ts` (cores, as duas curvas do site, durações) e `video/src/brand/fonts.ts`.

## Gramática visual do match.IA (use estas metáforas, não invente outras a cada cena)

| ideia | forma | movimento |
|---|---|---|
| cliente | sálvia `#7B8E7E`, lado **esquerdo** | entra da esquerda |
| arquiteto | terracota `#B0755A`, lado **direito** | entra da direita |
| match | os dois arcos do símbolo se encontrando no topo (ponto grafite) | convergência para o centro, nunca "explosão" |
| IA trabalhando | linhas finas desenhando como **prancha de arquitetura** (traço, cota, grid) | traçado contínuo (`evolvePath`), não partículas |
| confiança / transparência | painéis de vidro, números com casas fixas | revelar camada por camada, sem pressa |
| casa / projeto | fotos reais de `assets/img/photos/` | câmera lenta (push-in 3–6%), nunca zoom rápido |

Direção de tela é **contrato**: cliente sempre à esquerda, arquiteto à direita, do primeiro ao último quadro. Inverter só se a cena for literalmente "trocar de lado".

## Processo

1. **Brief em uma frase** — "Depois de assistir, a pessoa sabe que ___". Se precisar de duas frases, são dois vídeos.
2. **Público e contexto de exibição** — no site o vídeo começa mudo? (sim, se autoplay) → a história tem que funcionar **sem som**, com legenda/tipografia. Na banca: com som, tela grande.
3. **Arco emocional** (ver `cinematic-video-production`): gancho → tensão (o problema real: achar arquiteto é no escuro) → mecanismo (como o match funciona) → prova (score, motivos, projeto fechado) → convite.
4. **Intenção por cena** — para cada cena escreva: *o que o olho vê primeiro*, *o que entende*, *o que sente*. Uma cena = **uma** ideia.
5. **Hierarquia** — por cena, no máximo 1 elemento herói, 2 de apoio, o resto ambiente. Herói = maior contraste + primeiro a se mover.
6. **Tabela de timing** (formato abaixo), em quadros a 30 fps, amarrada à narração.
7. **Animatic** — renderize stills dos quadros-chave (`npm run still -- <id> out/k-<n>.png --frame=<n>`) ou uma sequência JPEG (`npm run frames`) e revise como contact sheet antes de polir.
8. Só então implemente com as skills de execução. Revise com o checklist.

### Formato da tabela de timing

```
cena  quadros   fala (narration.json)    herói / evento                     curva       observação
c1    0–24      —                         título sobe na máscara             ease.out    leitura 0,8 s antes da fala
c1    18–60     c1-0 (Antonio)            chips entram da ESQUERDA, 2 q/chip  ease.out    stagger 0,07 s
c1    60–108    c1-0                      anel 0→95% (contador)              ease.out    número para ANTES da fala citar "95"
c1    108–150   —                         card do arquiteto entra da DIREITA ease.out    hold 1,2 s
```

## Ritmo e timing

- **Respire depois de cada ideia**: hold mínimo de `dur.hold` (1,2 s) parado e legível antes de sair. Corte sem hold = ninguém leu.
- **Antecipe a fala**: o visual de uma ideia chega 4–8 quadros **antes** da palavra correspondente na narração (o olho lê mais rápido que o ouvido entende).
- **Uma coisa se move por vez** no foco. Movimento secundário só com metade da amplitude e começando ≥ 6 quadros depois.
- **Varie a densidade**: alterne cena densa (lista, gráfico) com cena de respiro (frase grande, foto). Três cenas densas seguidas cansam.
- Velocidades de referência (30 fps): micro 6 q · reveal 15–18 q · stagger 2 q · troca de cena 18 q · câmera 30–42 q.

## Easing — só as curvas do site

- `ease.out` = `cubic-bezier(.2,.8,.2,1)` → tudo que **entra** e todo movimento de câmera.
- `ease.inOut` → **saídas** e transições entre cenas.
- `ease.spring` (leve overshoot) → **só** peças pequenas (chip, ícone, tick). Nunca em título, foto, painel ou câmera.
- Proibido: `linear` em movimento visível (só em loop de fundo imperceptível), bounce, elastic.
- Entradas desaceleram (chegam suaves), saídas aceleram (somem decididas) e são **mais curtas** que a entrada (~70%).

## Transições — escolha pelo significado

| situação | transição |
|---|---|
| mesma ideia, novo detalhe | **match cut**: um elemento continua de uma cena para a outra (ex.: o anel de 95% vira o ponto do símbolo) |
| mudança de capítulo (cliente → arquiteto) | **wipe direcional** da esquerda para a direita (a direção de tela conta a história) |
| respiro / mudança de clima | **fade** curto (12–18 q) |
| final | escurecer para `color.night` + logo reveal |

Evite trocar de transição a cada cena: 2–3 tipos no vídeo inteiro.

## Análise de referências

Quando o usuário trouxer referências (Awwwards, Godly, vídeos de produto), anote **mecânica**, não estética:
1. Quantos quadros dura cada entrada? Qual a curva (desacelera muito no fim?)
2. O que se move primeiro? Quantos elementos simultâneos?
3. Como a câmera se comporta (fixa, push-in, pan)?
4. Como a tipografia entra (máscara, opacidade, por palavra)?
5. O que é cor/forma da marca deles e **não** deve ser copiado?

Traduza para a gramática do match.IA. Nunca copie layout ou paleta da referência.

## Erros a evitar (cara de "vídeo feito por IA")

- Tudo entrando com o mesmo fade+slide de baixo, ao mesmo tempo.
- Gradiente roxo/azul, brilho pulsando, partículas flutuando sem motivo, "glow" em tudo.
- Texto letra por letra em frase longa; texto girando 3D.
- Zoom rápido em foto, shake de câmera, transição "cubo/página virando".
- Ícones genéricos de stock e números inventados ("+300% de eficiência").
- Música épica com narração calma (ou o contrário).
- Cena que não muda nada por > 4 s sem motivo; cena que muda tudo em < 1 s.

## Checklist do diretor

- [ ] A frase-brief cabe em uma linha e o vídeo inteiro serve a ela.
- [ ] Funciona sem som (legenda/tipografia carregam a história).
- [ ] Cliente sempre à esquerda/sálvia, arquiteto à direita/terracota.
- [ ] Cada cena tem um herói e ele se move primeiro.
- [ ] Toda ideia tem hold ≥ 1,2 s antes de sair.
- [ ] Só `ease.out` / `ease.inOut` / `ease.spring` (spring só em peça pequena).
- [ ] No máximo 3 tipos de transição, cada um com significado.
- [ ] Nenhum item da lista "cara de IA" acima.
- [ ] Revisado em stills de quadros-chave antes do polimento.
