# Atualização v0.4.0 - estoque, exclusão definitiva e identidade visual

## 1. Baixa de estoque corrigida

A confirmação de consumo agora respeita a unidade cadastrada no material.

- **Unidade, chapa, rolo, lata, kit e pacote:** somente quantidades inteiras.
- **Metro, litro, mililitro e quilograma:** aceitam quantidades decimais.
- **Metro quadrado (m²):** pode ser informado diretamente ou calculado por largura, altura e quantidade de peças.

Fórmula utilizada no cálculo por medidas:

`m² = (largura em mm / 1000) × (altura em mm / 1000) × quantidade de peças`

Ao confirmar a baixa, o sistema:

1. valida o saldo disponível;
2. reduz o saldo do material;
3. atualiza o consumo vinculado ao pedido/OS;
4. cria uma movimentação negativa no estoque;
5. registra usuário, data, observação e memória de cálculo no histórico.

Pedidos cancelados ou concluídos não aceitam novas baixas.

## 2. Exclusão definitiva global

A opção **Excluir definitivamente** é exibida somente ao perfil `super_admin` nos módulos que possuem registros persistidos:

- Pedidos / OS;
- Produção;
- Materiais e categorias;
- Entradas / compras;
- Movimentações de estoque;
- Clientes;
- Fornecedores;
- Financeiro;
- Usuários;
- Anexos.

Cada exclusão exige confirmação explícita. Quando necessário, o backend reverte movimentos de estoque e remove vínculos dependentes antes de apagar o registro. A operação gera uma entrada de auditoria.

Os relatórios PDF são gerados sob demanda e não ficam armazenados como registros permanentes; portanto, não exigem botão de exclusão.

## 3. Medidas recomendadas para imagens

A área **Configurações > Identidade visual** passa a exibir as dimensões recomendadas:

| Imagem | Recomendada | Mínimo | Proporção |
|---|---:|---:|---:|
| Logo do painel | 720 × 240 px | 360 × 120 px | 3:1 |
| Logo da tela de login | 1200 × 1200 px | 600 × 600 px | 1:1 |
| Ícone do navegador | 512 × 512 px | 128 × 128 px | 1:1 |

Formatos aceitos: SVG, PNG, WEBP e JPG. Para o favicon: SVG, PNG ou ICO. Limite: 3 MB por arquivo.

## Implantação

Esta atualização não altera o esquema do banco D1 e não inclui um novo arquivo de migração. O comando de deploy pode exibir `No migrations to apply`, o que é esperado.
