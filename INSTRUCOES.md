# Atualização MKNG Visual Control v0.5.0

## Conteúdo da versão

Esta atualização cria o módulo **Perdas / Reimpressões** para registrar desperdícios de materiais e refletir imediatamente seus efeitos no estoque e no custo operacional do Job.

## Instalação pelo GitHub

1. Extraia o arquivo `mkng-visual-control-update-v0.5.0.zip` no computador.
2. No repositório `sercominteligente/mkng-visual-control`, clique em **Add file → Upload files**.
3. Arraste o conteúdo extraído para a raiz do repositório.
4. Permita a substituição dos arquivos existentes.
5. Faça o commit diretamente na branch `main` com a mensagem:

```text
Implementa perdas, reimpressões e custo real do Job
```

O pacote incremental não contém `wrangler.jsonc`, segredos de ambiente nem configurações exclusivas da Cloudflare.

## Migração D1

O comando de implantação já configurado deve aplicar automaticamente:

```text
0006_material_losses.sql
```

No log da Cloudflare, confirme:

```text
0006_material_losses.sql | ✅
```

## Roteiro mínimo de validação

1. Abra **Perdas / Reimpressões**.
2. Registre uma perda geral de pequena quantidade e confirme a redução do estoque.
3. Estorne a perda como Super Administrador e confirme a devolução ao estoque.
4. Abra um Pedido/OS não concluído e registre uma perda vinculada ao Job.
5. Marque a necessidade de reimpressão e confira a nova reserva do material.
6. Gere o relatório PDF **Perdas e reimpressões**.
7. Confira no PDF do Pedido/OS a seção de perdas.

Não utilize materiais reais durante a primeira rodada. Faça os testes com um cadastro temporário e quantidades pequenas.
