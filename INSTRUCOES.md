# Atualização MKNG Visual Control v0.2.0

Extraia o pacote e envie seu conteúdo para a raiz do repositório `sercominteligente/mkng-visual-control`, preservando as pastas.

Mensagem de commit recomendada:

`Implementa categorias dinâmicas e perfis técnicos de materiais`

A Cloudflare executará o build automático. O comando de implantação atual aplicará a migração `0003_material_catalog_improvements.sql` antes de publicar o Worker.

Após o build verde, testar nesta ordem:

1. Estoque → Gerenciar categorias.
2. Criar categoria `Lonas`.
3. Novo material → perfil `Rolo ou mídia flexível`.
4. Cadastrar `Lona 280 g`, largura `1600`, comprimento `50`, gramatura `280`, unidade `Rolo`.
5. Testar exclusão de um material sem histórico.
6. Testar desativação de um material com histórico operacional.
