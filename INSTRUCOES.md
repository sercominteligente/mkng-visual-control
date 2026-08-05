# MKNG Visual Control — atualização 0.4.2

## Conteúdo

- baixa automática ao concluir Pedido/OS com materiais pendentes;
- baixa manual por unidade e m²;
- quatro relatórios PDF independentes;
- entrada/sinal e forma de pagamento em Contas a receber;
- pagamentos adicionais e recibo PDF;
- migração D1 `0005_finance_receipts.sql`.

## Implantação

1. Extraia o ZIP incremental.
2. Envie o conteúdo extraído para a raiz do repositório `mkng-visual-control`.
3. Permita a substituição dos arquivos existentes.
4. Faça o commit na branch `main` com a mensagem:

```text
Corrige baixa, relatórios e recebimentos financeiros
```

5. Acompanhe o build da Cloudflare.
6. Confirme no log:

```text
0005_finance_receipts.sql ✅
```

## Teste rápido após o deploy

1. Crie um Pedido/OS com material em unidade e conclua com baixa automática.
2. Crie outro com material em m² e confirme a baixa por medidas.
3. Gere os quatro relatórios e confira os títulos distintos.
4. Cadastre uma conta a receber com entrada/sinal e forma de pagamento.
5. Registre um segundo pagamento e gere o recibo em PDF.

O pacote incremental não contém `wrangler.jsonc`, `src/server/auth.ts`, arquivos `.env` ou segredos.
