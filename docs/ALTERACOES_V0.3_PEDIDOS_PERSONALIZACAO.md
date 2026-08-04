# MKNG Visual Control — Atualização 0.3.0

## Alterações implementadas

### Pedidos e Ordens de Serviço

- Cancelamento formal com motivo obrigatório.
- Liberação automática das reservas de materiais no cancelamento.
- Cancelamento de etapas pendentes e contas a receber ainda abertas.
- Exclusão definitiva de rascunhos exclusiva do Super Administrador.
- Bloqueio de exclusão quando existem movimentações de estoque ou financeiro.
- Exclusão segura dos anexos associados no Cloudflare R2.
- Histórico auditável de cada movimentação do pedido.
- Snapshot do pedido em cada evento importante.
- PDF atual do Pedido/OS e PDF individual de cada movimentação.
- PDFs sem valores financeiros para perfis sem permissão financeira.

### Configurações e identidade visual

- Personalização do logotipo do painel.
- Personalização do logotipo da tela de login.
- Personalização do favicon.
- Personalização de empresa, setor, título, subtítulo, descrição e cores.
- Visualização prévia antes da aplicação.
- Arquivos armazenados no Cloudflare R2.
- Aplicação automática das alterações, sem novo deploy.
- Assinatura técnica protegida: `Powered by: SER Comunicação Inteligente & Hakham IA`.

### Manutenção exclusiva do Super Administrador

- Prévia dos registros elegíveis para limpeza.
- Limpeza em lote de rascunhos de pedidos e compras.
- Limpeza opcional de clientes e materiais identificados como teste e sem histórico.
- Limpeza opcional de registros financeiros em rascunho.
- Confirmação obrigatória com a expressão `LIMPAR TESTES`.
- Perfis Administrador, Gestor, Produção, Estoque, Financeiro e Consulta não têm acesso.

## Migração

A migração `0004_orders_branding_maintenance.sql` cria o histórico de eventos, adiciona os campos de cancelamento e registra as configurações iniciais de identidade visual.
