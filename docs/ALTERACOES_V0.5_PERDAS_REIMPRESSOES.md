# Alterações v0.5.0 — Perdas e Reimpressões

## Objetivo

Separar o material utilizado produtivamente do material desperdiçado, mantendo o saldo físico, o histórico do Job e o custo operacional coerentes.

Exemplo:

```text
Material planejado: 5 m
Impressão perdida: 5 m
Reimpressão concluída: 5 m
Consumo produtivo: 5 m
Perda operacional: 5 m
Baixa física total: 10 m
```

## Novo módulo

O menu **Perdas / Reimpressões** permite registrar perdas gerais ou vinculadas a um Pedido/OS.

Cada registro contém:

- material;
- quantidade na unidade cadastrada;
- cálculo por largura × altura × peças para materiais em m²;
- tipo da perda;
- etapa da produção;
- motivo obrigatório;
- máquina ou equipamento;
- operador identificado pelo usuário logado;
- observações;
- foto ou PDF opcional no Cloudflare R2;
- indicação e quantidade de reimpressão.

## Tipos de perda

- perda operacional;
- configuração ou calibração;
- erro humano;
- defeito do material;
- sobra não reaproveitável.

## Efeito no estoque

Ao confirmar uma perda, o sistema executa uma operação única:

1. valida o saldo físico;
2. reduz o estoque do material;
3. cria movimentação do tipo `loss`;
4. registra o custo estimado pela quantidade × custo médio;
5. vincula a perda ao Pedido/OS, quando informado;
6. atualiza os totais de perda e reimpressão do material no Job;
7. registra auditoria e evento na linha do tempo.

Para materiais cadastrados em m², a perda pode ser informada diretamente ou calculada por dimensões.

## Reimpressão

Quando houver reimpressão, a quantidade informada volta a compor a reserva do Pedido/OS. O sistema verifica se o saldo restante suporta todas as reservas antes de confirmar.

Caso não haja saldo suficiente, a perda deve ser registrada sem a reserva automática de reimpressão, ou a quantidade deve ser ajustada após a reposição do estoque.

## Estorno auditável

Perdas confirmadas não são apagadas silenciosamente. O Super Administrador pode usar **Estornar**, informando uma justificativa obrigatória.

O estorno:

- devolve a quantidade ao estoque;
- cria movimentação `loss_reversal`;
- ajusta os totais do Pedido/OS;
- registra usuário, data, motivo e auditoria.

## Indicadores e relatórios

O painel do módulo apresenta:

- quantidade de perdas;
- custo estimado;
- número de reimpressões;
- motivo mais frequente;
- máquina mais recorrente;
- operador com mais registros.

O relatório PDF apresenta perdas, materiais, quantidades, custos, etapas, máquinas, operadores, motivos, reimpressões e status.

O PDF do Pedido/OS também inclui suas perdas e reimpressões vinculadas.
