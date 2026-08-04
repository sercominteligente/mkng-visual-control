# Escopo funcional — V1 Beta

## Fluxo principal

```text
Demanda → Pedido/OS → Materiais planejados → Reserva → Produção
→ Consumo confirmado → Baixa no estoque → Financeiro → Relatório PDF
```

## Perfis de usuário

- Super administrador
- Administrador
- Gestor
- Produção
- Estoque
- Financeiro
- Consulta

## Estoque

Itens previstos inicialmente:

- Chapas de PVC e PVC expandido
- PS de diferentes espessuras
- ACM e acrílico
- Tintas solventes, UV e base d’água
- Adesivos e vinis
- Fitas, colas e itens de acabamento
- Insumos gerais

Cada material possui categoria, SKU, unidade, espessura, largura, altura, saldo, estoque mínimo, custo médio e localização.

## Regras operacionais

1. Reserva não altera o saldo físico.
2. Consumo confirmado gera movimentação negativa.
3. Devolução de sobra gera movimentação positiva.
4. Compra só altera o estoque quando recebida.
5. Ajustes manuais exigem justificativa.
6. Materiais com movimentação não podem ser excluídos; devem ser desativados.
7. Pedidos com baixa de estoque não podem ser excluídos; devem ser cancelados.
8. Toda ação relevante gera auditoria.

## Relatórios

- Pedidos e produção
- Posição de estoque
- Movimentações de estoque
- Financeiro

Todos incluem a assinatura:

**Powered by: SER Comunicação Inteligente & Hakham IA**
