# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Três papéis autenticados, cadastro único (nome, e-mail, senha, foto, bio):

- **Arquiteto** — papel prioritário quando há conflito de decisão (confirmado com o usuário). Cadastra portfólio (peças com estilo/materiais/metragem), perfil profissional (faixa de preço, disponibilidade, especialidade), solicita verificação CAU (aprovação humana da equipe) e recebe sugestões de clientes por compatibilidade.
- **Cliente** — cria um ou mais projetos (estilo, orçamento, materiais, objetivos, metragem) e roda o match de IA contra o portfólio dos arquitetos. Sempre gratuito: sem plano, sem limite de busca, sem resultado bloqueado.
- **Loja parceira** (`role: "store"`) — cadastra os próprios produtos manualmente (nunca por scraping); a IA sugere produtos que combinam com o projeto do cliente, que confirma explicitamente uma "simulação de compra" (nunca rastreamento passivo).

## Product Purpose

Conectar clientes e arquitetos por compatibilidade calculada por IA — comparando o projeto do cliente contra cada peça do portfólio do arquiteto (estilo, material, localização, especialidade, disponibilidade, experiência, metragem) — em vez de busca por palavra-chave ou diretório estático. Projeto de TCC (FIAP School), atualmente **finalizando para a banca** (confirmado com o usuário): o objetivo imediato é fechar o entregável acadêmico, não lançar em produção.

## Positioning

Match por **projeto vs. portfólio real**, não por perfil geral: `scoreProjectToArchitect` usa a peça de portfólio que melhor combina como motivo do match, com explicação gerada por IA (Gemini) no grupo principal. Resultados são **categorizados com motivo** (melhor compatibilidade, indisponível no momento, fora da região, fora do orçamento, fora do estilo mas bem avaliado) em vez de um "top 4" que descarta o resto sem explicação — nenhum resultado desaparece silenciosamente. Diferencial de negócio: arquiteto Pro recebe **bônus** de ranking, nunca topo garantido (mérito real sempre pode superar um Pro fraco).

## Operating Context

- Front-end estático (HTML/CSS/JS puro, sem build step) servido pelo mesmo processo Express do back-end, mesma porta.
- Back-end é um fork local do repositório de referência [Arkitetum.AI](https://github.com/RobPFilho/Arkitetum.AI) (Node/Express/MongoDB); mudanças aditivas próprias (mensagens, avaliações, moodboard, CAU, projetos, favoritos, notificações, lojas) precisam de revisão do autor original (Roberto) antes de ir para o repositório principal — ainda não houve esse push.
- Requer MongoDB rodando (conexão obrigatória). Sem chaves de API (Gemini, Unsplash), as funcionalidades de IA caem em respostas padrão em vez de falhar.
- 10 arquitetos fictícios de demonstração (domínio `@match.arquitetos.demo`) alimentam o algoritmo de match no protótipo.
- PWA (manifest + service worker network-first) e modo escuro (claro/escuro/sistema).

## Capabilities and Constraints

- **Sem gateway de pagamento real**: assinatura Pro do arquiteto e comissão são simuladas (`Commission`), não processam dinheiro de verdade.
- **Verificação CAU é sempre manual**: não existe (nem deveria existir nesta fase) checagem automática contra a base pública do CAU/BR — aprovação é decisão humana da equipe via `npm run approve:cau`.
- **Sem geração de imagem por IA**: referência visual usa foto real via API do Unsplash (gratuita) em vez de gerar imagem (pago desde a primeira chamada em qualquer provedor testado).
- **Limites de custo de IA**: chamadas Gemini limitadas a 30/hora por usuário; timeout de 8s em explicações de compatibilidade para nunca travar o match.
- **LGPD**: exportação e exclusão de dados do usuário já implementadas, cobrindo inclusive favoritos.
- Cliente é sempre gratuito (sem plano, sem limite) — o freemium existe só do lado do arquiteto (Free vs. Pro) e da loja.
- Terminologia: "match" (execução da IA sobre um projeto), "peça de portfólio" (item do arquiteto usado no match), "resumo do projeto" (validado mutuamente por cliente e arquiteto via modelo `Validation`).

## Brand Commitments

- Nome: **match.IA**.
- Símbolo: casa (arquitetura) + pessoas (cliente e arquiteto) + arco com circuitos (tecnologia/IA) — `assets/img/mark.svg`.
- Paleta: Off-white quente `#FAF9F6`, Bege areia `#EEE3DA`, Verde sálvia `#7B8E7E`, Terracota/cobre `#B0755A`, Grafite `#333333`.
- Tipografia: Playfair Display (títulos) + Inter (corpo).
- Idioma: português do Brasil (`lang="pt-BR"`) em todo o site.

## Evidence on Hand

- Banco de materiais com 18 materiais e fotos reais do Unsplash (com atribuição de fotógrafo obrigatória pela licença).
- Blog institucional com 3 posts reais (capas do Unsplash).
- `assets/3d/mansion-3d.html` (estudo three.js) existe no repositório mas **não é mais referenciado** por nenhuma página — a vitrine (home/`projetos.html`) usa carrossel de projetos reais com match verificado + ranking de arquitetos.
- Testes automatizados do algoritmo de match (`backend/tests/scoringEngine.test.js`).
- README do projeto (`README.md`) documenta o histórico completo de rodadas de desenvolvimento — tratar seções antigas como histórico, não como estado atual quando conflitarem com a seção "Reformulação pós-mentorias v2" (mais recente).

## Product Principles

1. Nenhum resultado de match desaparece sem explicação — categorizar com motivo em vez de filtrar silenciosamente.
2. Mérito real (nota + projetos fechados) sempre pode superar vantagem paga — Pro é bônus, nunca garantia.
3. Nada de simulação disfarçada de dado real: avaliação, comissão e indicação só se tornam reais quando ambas as partes confirmam a ação (nunca client-side "fingindo" pelo outro papel).
4. Falta de dado nunca vira suposição de incompatibilidade (ex.: sem faixa de preço cadastrada, não classifica como "fora do orçamento").
5. Custo de IA é uma restrição de produto, não só técnica — funcionalidades de IA sempre têm fallback padrão sem chamada extra.

## Accessibility & Inclusion

WCAG AA já implementado e verificado nesta base: contraste recalibrado (texto normal ≥ 4.5:1 nos dois temas), diálogos acessíveis (foco, Esc, `role="dialog"`), abas com navegação por teclado, `prefers-reduced-motion` respeitado, leitura por estrelas com `radiogroup`/`aria-label`, skip link, `aria-live` em erros. Sem dependência de áudio/vídeo em nenhum fluxo. Sem requisito de acessibilidade adicional confirmado além do já implementado.
