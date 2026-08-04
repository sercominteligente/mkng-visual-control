# MKNG Soluções — Setor de Comunicação Visual

Sistema interno para gestão de demandas, pedidos, produção, estoque, compras, consumo de materiais, financeiro e relatórios em PDF.

**Assinatura oficial:** Powered by: SER Comunicação Inteligente & Hakham IA

## Versão atual

**v0.2.0 — Estoque e materiais aprimorados**

- Categorias dinâmicas e administráveis.
- Perfis técnicos para chapas, rolos, tintas e insumos.
- Gramatura, comprimento de rolo, volume, cor, acabamento e embalagem.
- SKU automático e exclusão segura.
- Disponibilidade calculada com reservas.

## Estado do projeto

Esta entrega corresponde à **V1 Beta funcional**. A estrutura, banco, APIs, telas e regras principais já estão implementados. Antes do uso em produção, a aplicação deve passar por implantação na Cloudflare, aplicação das migrações D1 e testes operacionais com dados reais controlados.

## Funcionalidades incluídas

- Login seguro com sessão em cookie HTTP-only.
- Criação automática do primeiro administrador por segredos de ambiente.
- Multiusuários com perfis e permissões.
- Painel com indicadores operacionais e financeiros.
- Clientes e fornecedores.
- Materiais por categoria, unidade, dimensões, localização, saldo e estoque mínimo.
- Compras com múltiplos itens e recebimento integrado ao estoque.
- Pedidos e ordens de serviço.
- Planejamento e reserva de materiais por pedido.
- Baixa somente após confirmação do consumo.
- Devolução de sobras ao estoque.
- Ajustes manuais auditados.
- Produção em etapas: briefing, criação, impressão, acabamento, instalação e conclusão.
- Contas a receber e a pagar.
- Anexos em Cloudflare R2.
- Relatórios PDF de pedidos, estoque, movimentações e financeiro.
- Auditoria de ações.
- Configurações gerais da empresa e do setor.
- Interface responsiva em padrão escuro premium com destaques em laranja.

## Arquitetura

- **Frontend:** React + Vite
- **Backend:** Cloudflare Worker + Hono
- **Banco:** Cloudflare D1
- **Arquivos:** Cloudflare R2
- **PDF:** pdf-lib
- **Hospedagem:** Cloudflare Workers + Static Assets
- **CI/CD:** GitHub conectado à Cloudflare

## Estrutura principal

```text
src/
  components/       componentes reutilizáveis
  lib/              cliente de API e roteamento
  pages/            telas do sistema
  server/           autenticação, tipos e geração de PDF
  worker.ts         API e regras de negócio
migrations/         estrutura e dados iniciais do D1
public/             logotipo e favicon
docs/               referências, escopo e implantação
wrangler.jsonc      configuração Cloudflare
```

## Instalação local

```bash
npm install
cp .env.example .dev.vars
npm run db:migrate:local
npm run build
npm run preview
```

Para desenvolvimento visual rápido do frontend:

```bash
npm run dev
```

As APIs e o banco são executados pelo Wrangler. Para testar o sistema completo, use `npm run preview`.

## Primeiro acesso

Configure estes segredos no ambiente da Cloudflare:

```text
INITIAL_ADMIN_NAME
INITIAL_ADMIN_EMAIL
INITIAL_ADMIN_PASSWORD
SESSION_SECRET
```

Na primeira tentativa de login, se a tabela `users` estiver vazia, o sistema cria o administrador informado nos segredos.

## Regra crítica de estoque

A criação de um pedido **não baixa o estoque**. O sistema permite planejar e reservar materiais, mas a saída física ocorre somente quando um usuário autorizado confirma o consumo. Isso preserva rastreabilidade e evita baixas prematuras.

## Implantação

Consulte [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md).

## Atualização 0.3.0

A versão 0.3.0 adiciona cancelamento formal de pedidos, exclusão segura de rascunhos exclusivamente pelo Super Administrador, histórico auditável com PDFs por movimentação, personalização visual por arquivos no R2 e manutenção controlada de dados de teste.

Consulte `docs/ALTERACOES_V0.3_PEDIDOS_PERSONALIZACAO.md`.
