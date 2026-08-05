# Alterações v0.4.2

## 1. Baixa de estoque

- A confirmação manual continua aceitando unidade, chapa, rolo, litro, metro, kg e m².
- Para m², a quantidade pode ser informada diretamente ou calculada por largura × altura × peças.
- Ao concluir um Pedido/OS com materiais reservados ainda pendentes, o sistema solicita confirmação e realiza a baixa automática.
- A conclusão é bloqueada quando algum material não possui saldo suficiente.
- Cada baixa gera movimentação de estoque, auditoria e evento no histórico do Pedido/OS.

## 2. Relatórios PDF

Cada cartão utiliza seu próprio relatório:

- Pedidos e produção;
- Posição de estoque;
- Movimentações de estoque;
- Financeiro.

O relatório financeiro passa a exibir total, valor recebido, saldo, forma de pagamento e status.

## 3. Contas a receber

Novos campos:

- valor total;
- entrada/sinal;
- forma de pagamento: PIX, espécie, cartão ou transferência;
- data do pagamento;
- vencimento do saldo;
- referência do pagamento;
- saldo restante calculado automaticamente.

Também é possível registrar pagamentos posteriores e emitir recibo em PDF.

## 4. Permissões e personalização

- Exclusões definitivas continuam restritas ao Super Administrador.
- Medidas recomendadas na personalização:
  - logo do painel: 720 × 240 px;
  - logo do login: 1200 × 1200 px;
  - favicon: 512 × 512 px.
