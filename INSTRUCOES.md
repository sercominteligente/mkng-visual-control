# Como instalar a atualização v0.4.0

1. Extraia o arquivo ZIP de atualização.
2. No GitHub, abra o repositório do sistema.
3. Clique em **Add file > Upload files**.
4. Arraste o conteúdo extraído para a raiz do repositório.
5. Permita a substituição dos arquivos existentes.
6. Confirme que o pacote não contém `wrangler.jsonc`.
7. Use a mensagem de commit:

   `Corrige baixas de estoque e exclusões do Super Admin`

8. Aguarde o build automático da Cloudflare ficar verde.
9. No log, é normal aparecer `No migrations to apply`.
10. No navegador, pressione `Ctrl + F5` antes dos testes.

## Teste mínimo após o deploy

- Cadastre um material por unidade com saldo 10 e dê baixa de 2. O saldo deve ficar 8.
- Cadastre um material em m² com saldo 20 e consuma uma peça de 1000 × 2000 mm. O saldo deve ficar 18 m².
- Confirme que usuários não Super Admin não veem os botões de exclusão definitiva.
- Confirme as medidas exibidas em Configurações > Identidade visual.
