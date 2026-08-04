# Roteiro de testes da V1

## Autenticação

- Criar o primeiro administrador automaticamente.
- Login com senha correta.
- Rejeição de senha incorreta.
- Encerramento da sessão.
- Criação de usuário por perfil.

## Estoque e compras

- Cadastrar material com saldo zero.
- Criar compra com dois itens.
- Confirmar recebimento.
- Validar saldo e custo médio.
- Fazer ajuste positivo e negativo.
- Impedir estoque negativo.

## Pedido e produção

- Criar cliente e pedido.
- Vincular materiais planejados.
- Verificar reserva sem baixa.
- Avançar etapas de produção.
- Confirmar consumo.
- Verificar baixa física.
- Registrar devolução.
- Concluir a OS.

## Financeiro

- Criar conta a receber.
- Criar conta a pagar.
- Marcar lançamentos como pagos.
- Conferir totais do painel.

## Relatórios

- Gerar todos os PDFs.
- Conferir logotipo, título, datas, totais e assinatura Powered by.
- Testar períodos sem registros.

## Segurança e dados

- Validar que perfis sem permissão não acessam módulos restritos.
- Conferir cookies HTTP-only e Secure.
- Testar upload e leitura de anexos R2.
- Conferir auditoria de criação, edição, baixa e recebimento.
