# MKNG Visual Control — Alterações v0.2 do Estoque

## Escopo implementado

1. Categorias dinâmicas de materiais.
   - Criação rápida dentro do cadastro de material.
   - Tela de gerenciamento com criação, edição, ordenação, ativação, desativação e exclusão segura.
   - Bloqueio de exclusão quando a categoria possui materiais vinculados.

2. Perfis técnicos de material.
   - Chapa ou placa: largura, altura e espessura em milímetros.
   - Rolo ou mídia flexível: largura em milímetros, comprimento em metros, gramatura em g/m² e acabamento.
   - Tinta ou líquido: cor, volume em litros e embalagem.
   - Insumo geral: apresentação ou embalagem.

3. Cadastro de lona corrigido.
   - Exemplo: Lona 280 g, largura 1.600 mm, comprimento 50 m e gramatura 280 g/m².
   - O saldo permanece em rolos; comprimento e gramatura não são tratados como saldo.

4. SKU automático.
   - Quando o campo SKU fica vazio, o sistema gera um código único.

5. Exclusão segura de materiais.
   - Materiais sem histórico operacional podem ser excluídos.
   - Um saldo inicial isolado pode ser removido junto com o material de teste.
   - Materiais com compras, pedidos ou movimentações operacionais são desativados para preservar auditoria e relatórios.

6. Cálculo de disponibilidade e criticidade.
   - Disponível = saldo atual − reservado.
   - O status crítico utiliza o disponível, e não apenas o saldo bruto.

7. Apresentação de quantidades.
   - Singular e plural por unidade de estoque.
   - Formatação pt-BR para números e especificações.

## Migração D1

A implantação aplica automaticamente:

- `migrations/0003_material_catalog_improvements.sql`

A migração adiciona os campos técnicos de rolos, tintas e apresentações, além dos metadados das categorias.
