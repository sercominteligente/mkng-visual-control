# Relatório de validação — MKNG Visual Control 0.3.0

## Validações executadas

- Sintaxe TypeScript/TSX processada em todos os arquivos da pasta `src` sem erros de parser.
- Migrações `0001` a `0004` aplicadas em banco SQLite de teste.
- Migração `0004_orders_branding_maintenance.sql` validada com pedido existente e criação do snapshot legado.
- Estrutura final confirmada com 19 tabelas, incluindo `order_events`.
- Configuração do D1 e R2 preservada no projeto completo.

## Funcionalidades cobertas

- Cancelamento com motivo e preservação de histórico.
- Exclusão de rascunho somente por Super Administrador.
- Limpeza controlada de dados de teste.
- Eventos auditáveis e PDFs por movimentação.
- Personalização de logos, favicon, textos e cores via Cloudflare R2.
- Identidade aplicada ao login, painel e PDFs.

## Observação de implantação

A Cloudflare deverá executar automaticamente a migração `0004` porque o comando de implantação já utiliza:

```bash
npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
```

Após o build verde, atualizar o navegador com `Ctrl + F5` e validar primeiro a exclusão de um rascunho de teste e o envio do logotipo do painel.
