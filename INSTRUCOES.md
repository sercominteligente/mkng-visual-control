# Atualização MKNG Visual Control 0.3.0

## Como enviar ao GitHub

1. Extraia este ZIP no computador.
2. No repositório `mkng-visual-control`, clique em `Add file` → `Upload files`.
3. Arraste **o conteúdo extraído**, mantendo as pastas.
4. Permita a substituição dos arquivos existentes.
5. Confirme que o arquivo `migrations/0004_orders_branding_maintenance.sql` aparece na lista.
6. Faça o commit diretamente na branch `main`.

Mensagem do commit:

```text
Implementa cancelamento, PDFs e personalização visual
```

## Proteções

- Este pacote não contém `wrangler.jsonc`; o Database ID e o endereço atual não serão alterados.
- `src/server/auth.ts` preserva o PBKDF2 em 100.000 iterações e adiciona a proteção exclusiva do Super Administrador.
- A Cloudflare aplicará a migração `0004` automaticamente no próximo build.

## Primeiro teste após o build verde

1. Pressione `Ctrl + F5` no sistema.
2. Abra um pedido em rascunho e confirme que apenas o Super Administrador vê `Excluir rascunho`.
3. Abra uma movimentação no histórico e gere o PDF.
4. Em `Configurações`, envie um logo de teste para o painel.
