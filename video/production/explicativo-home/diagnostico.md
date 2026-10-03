# Diagnóstico — vídeo explicativo da home (versão 1)

Peça: player HTML/CSS da seção `#para-clientes-e-arquitetos` (`index.html`,
`assets/js/explainer-video.js`, `assets/css/explainer.css`). 14 cenas, 1:58,
narração neural (17 falas) + legendas em balões. Revisado quadro a quadro em
2026-10-03, tema claro, palco a 903 px.

## O que funciona (preservar)

- Conceito "Dois lados, um match" e o formato de **conversa** (balões) — dá voz e ritmo.
- Ordem das cenas e o conteúdo de cada uma (intro → cliente 01–05 → ponte → arquiteto 01–06 → final).
- Motor determinístico (`render(t)`): pausar/arrastar/capítulos sem erro.
- Identidade: paleta, Playfair + Inter, itálico terracota/sálvia como ênfase, mudança de cor de fundo por ato.
- Ideias visuais fortes: anel de 95%, ranking em que "Você" sobe (a6), barras antes/depois (a5), assinatura desenhada (a1).

## Problemas (por gravidade)

1. **Slideshow**: as 14 cenas usam o mesmo layout (título no alto à esquerda, balão embaixo à esquerda, ilustração à direita) e **a mesma transição** — a cena inteira some para o fundo (0,4 s) e a próxima aparece (0,45 s). Nada continua de uma cena para a outra.
2. **Um único movimento para tudo**: todo elemento entra com opacidade + 2,4u de deslocamento em 0,7 s, com a mesma curva. Não há saídas próprias (tudo some junto com a cena), nem antecipação, follow-through ou overshoot nas peças pequenas.
3. **Composição com o meio vazio**: a coluna esquerda tem título no alto e balão embaixo, com ~40% de vazio entre eles; a ilustração da direita é pequena (c5, ponte, a1, a5) e não segura a tela — o vazio parece sobra, não respiro.
4. **Tipografia pequena para vídeo**: kicker a ~9,5 px, rótulos de 9–11 px (agenda da c4, chips, legendas das amostras). Títulos sem ajuste de tracking; entram como bloco (sem reveal por palavra/máscara).
5. **Ritmo achatado**: a animação de cada cena termina em ~3,5 s e o resto é tela parada até a fala acabar (c4, ponte, intro). 31 s dos 1:58 não têm fala. Os eventos visuais não conversam com as palavras (o anel conta até 95 num tempo fixo, não quando a voz diz "combinam de verdade").
6. **Cenas fracas**: *ponte* (um ícone de compasso minúsculo no meio de um fundo vazio — é a virada do vídeo e parece placeholder); *c4* (as reuniões somem e a agenda fica rala; o "tempo livre" aparece em outros lugares, sem relação causal); *c3* (dois "quadrados" de textura chapada parecem cor sólida); *final* (três textos competindo: título, frase e balão; logo PNG pequeno).
7. **Sinais de template/IA**: avatares "C" e "A" em círculos; vidro em quase todos os cards; tudo com o mesmo fade-up.
8. **Profundidade e luz**: sem câmera, sem parallax; luz de fundo uniforme (só os blobs à deriva).
9. **Áudio**: só a voz; nenhum acento sonoro nos momentos de impacto.

## Direção da versão 2 (evolutiva)

- Manter roteiro, narração, ordem, conteúdo e o formato de conversa.
- Gramática de movimento com propósito: títulos em **máscara palavra por palavra** (rolam para cima ao sair = continuidade de posição entre cenas); peças pequenas com o **overshoot controlado** da curva `--ease-spring` do site; **saídas próprias** em cascata reversa, mais curtas e aceleradas; motion blur só em quem viaja longe.
- **Câmera**: push-in lento por cena + parallax do fundo.
- **Transições com significado**: íris saindo do ponto do match (intro → c1), *wipe* da esquerda para a direita com faixa de luz sálvia na virada cliente → arquiteto (c5 → ponte), íris saindo do selo "Projeto fechado" para o final (a6 → final); entre as demais, troca de título por máscara com o fundo contínuo (sem "mergulho" no vazio).
- **Composição**: ilustrações 14% maiores; c5 em faixa larga; ponte como cartão de capítulo com foto real de arquiteto desenhando; final noturno com a casa iluminada e o símbolo montado peça por peça.
- **Ritmo amarrado à voz**: eventos-chave disparados pela palavra falada (`data-on`); respiros mais curtos (alvo ~1:45).
- **Tipografia**: kicker e rótulos ≥ 12 px no palco de 900 px; títulos maiores com tracking negativo.
- **Som**: um único acento quente (sino suave sintetizado) no "Projeto fechado" e no ponto do logo.

## Resultado (versão 2, revisada em duas rodadas)

Duração 1:58 → **1:50** (a fala ocupa ~87 s; o resto agora é respiro e transição, não tela parada).

| ponto | v1 | v2 |
|---|---|---|
| transições | 13× "some e aparece" | íris do ponto do match (intro→c1), wipe esq.→dir. com faixa sálvia (c5→ponte), íris do selo "Projeto fechado" (a6→final); nas demais o título rola na mesma posição com o fundo contínuo |
| entradas | 1 movimento para tudo | títulos por palavra em máscara; kicker em wipe; peças pequenas com overshoot da curva do site; cartas com motion blur e rotação que assenta |
| saídas | nenhuma (cena inteira some) | cascata reversa, mais curta e acelerada |
| câmera | parada | push-in de 3,5% por cena + contra-movimento do texto; Ken Burns nas fotos |
| sincronia | tempos fixos | 42 eventos disparados pela palavra falada (`data-on`/`data-son`) |
| c4 | reuniões somem, "tempo livre" aparece em outro lugar | o mesmo horário vira "Tempo livre" (causa → efeito) |
| c5 | jornada pequena à direita | faixa larga atravessando a tela |
| ponte | ícone de compasso no vazio | foto real de arquiteto desenhando + wipe |
| final | 3 textos competindo, PNG pequeno | noite com a casa acesa; símbolo montado peça por peça; sino no ponto do topo |
| tipografia | kicker ~9,5 px, rótulos 9–11 px | kicker ~11 px com tracking .16em, rótulos ≥ 11,5 px, títulos 11% maiores com tracking negativo |
| material | vidro em quase tudo | papel na assinatura, no perfil do cliente e na planta; vidro só onde é painel de interface |

Problemas encontrados na 1ª rodada e corrigidos na 2ª: etapas da c5 empilhadas (variável `--x` colidindo com a saída), compasso desenhado brigando com a foto da ponte (removido), legenda do final sem contraste sobre a casa acesa (gradiente radial atrás do logo), jornada e final estourando no celular.

Conferido: tema claro e escuro, 375 px, reprodução real sem erros no console, custo de desenho ≤ 1,1 ms por quadro (íris incluída).

Limites conhecidos: a sincronia por palavra é proporcional à posição no texto (±0,3 s); para precisão de palavra, gravar `WordBoundary` no `build_narration.py`. O modo "menos animação" do sistema troca íris/wipe por fusão e remove deslocamentos (pela lógica do CSS; não dá para emular essa preferência no navegador de teste).
