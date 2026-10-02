# matchia-mcp-server

Servidor MCP (Model Context Protocol) para o [match.IA](../README.md). Expõe a API Express/MongoDB já existente em `backend/` como ferramentas MCP, para um cliente como Claude Desktop ou Claude Code conversar com a plataforma: buscar arquitetos, rodar match, gerenciar projetos e portfólio, mandar mensagem, avaliar, e mais.

Este servidor **não duplica lógica de negócio** — cada ferramenta é uma chamada HTTP fina para o backend real (`http://localhost:3000/api` por padrão), reaproveitando toda a validação, o algoritmo de match, os limites de taxa e os efeitos colaterais (e-mails, notificações, exclusão em cascata) que já existem lá.

## Pré-requisitos

- O backend do match.IA rodando (`npm run dev` na raiz do projeto), com MongoDB ativo. Sem isso, toda ferramenta retorna um erro claro dizendo que não conseguiu conectar.
- Node.js 18+.

## Instalação

```bash
cd mcp-server
npm install
npm run build
```

## Configuração no cliente MCP (Claude Desktop / Claude Code)

Adicione ao arquivo de configuração MCP do cliente (por exemplo, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "matchia": {
      "command": "node",
      "args": ["<caminho-absoluto-para-o-projeto>/mcp-server/dist/index.js"],
      "env": {
        "MATCHIA_BASE_URL": "http://localhost:3000/api"
      }
    }
  }
}
```

Ajuste `MATCHIA_BASE_URL` se o backend rodar em outra porta/host. Reinicie o cliente MCP depois de editar a config.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `MATCHIA_BASE_URL` | `http://localhost:3000/api` | Base da API do backend |
| `MATCHIA_TOKEN` | (nenhum) | Token JWT opcional pra já iniciar autenticado, sem precisar chamar `matchia_login` na conversa |

## Autenticação

A maior parte das ferramentas de leitura pública (buscar arquitetos, ver materiais, estatísticas, cases de sucesso em destaque) **não exige login**.

Para ações em nome de um usuário (rodar match, gerenciar projetos/portfólio, mensagens, avaliações, etc.), primeiro chame `matchia_login` (ou `matchia_register` para criar uma conta nova) — o token retornado fica guardado em memória pelo processo do servidor MCP enquanto ele estiver rodando. `matchia_logout` descarta esse token.

## Ferramentas destrutivas

`matchia_delete_my_account` exclui a conta e todos os dados relacionados em cascata (direito ao esquecimento da LGPD) e **não tem desfazer** — por isso exige um campo extra `confirm: true` além da confirmação padrão que a maioria dos clientes MCP já pede para ferramentas marcadas como destrutivas. As demais exclusões (`matchia_delete_project`, `matchia_delete_portfolio_piece`, `matchia_delete_store_product`) usam só a anotação padrão `destructiveHint`.

## Testando sem um cliente MCP

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Abre uma UI local pra chamar qualquer ferramenta manualmente e inspecionar a resposta.

## Estrutura

```
src/
  index.ts        Entrada do servidor (stdio) e registro de todas as ferramentas
  apiClient.ts     Cliente HTTP compartilhado (base URL, token em memória, formatação de erro)
  tools/           Uma ferramenta por arquivo, agrupadas 1:1 com backend/src/routes/*.js
```
