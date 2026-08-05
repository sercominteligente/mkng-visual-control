# Relatório de validação técnica — v0.5.0

## Escopo validado

- análise sintática dos arquivos TypeScript e TSX modificados por transpile do TypeScript;
- aplicação sequencial das migrações `0001` a `0006` em banco SQLite temporário;
- criação das colunas de perda e reimpressão em `order_materials`;
- criação da tabela `material_losses` e de seus índices;
- registro de perda por quantidade e por cálculo de m²;
- baixa do saldo e criação de movimentação de estoque;
- vínculo da perda ao Pedido/OS;
- reserva de material para reimpressão;
- estorno auditável com devolução ao estoque;
- anexos de perda no Cloudflare R2;
- módulo gerencial, indicadores e relatório PDF;
- inclusão das perdas no PDF do Pedido/OS;
- preservação das permissões e exclusões definitivas do Super Administrador.

## Resultado

A análise sintática dos arquivos modificados foi concluída sem erros. As seis migrações foram aplicadas com sucesso em um banco SQLite temporário, incluindo `0006_material_losses.sql`.

A instalação local completa das dependências não pôde ser concluída porque o registro de pacotes disponível neste ambiente não contém `@types/react`. O build definitivo deve ser confirmado pelo pipeline da Cloudflare após o commit no GitHub.

## Banco de dados

Esta versão exige a migração:

```text
0006_material_losses.sql
```

O comando de implantação configurado na Cloudflare deve aplicá-la automaticamente antes do deploy.
