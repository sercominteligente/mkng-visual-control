# Implantação na Cloudflare

## 1. Criar os recursos

Na mesma conta da Cloudflare usada pelo SERFlux, crie recursos independentes:

- Worker: `mkng-visual-control`
- D1: `mkng-visual-db`
- R2: `mkng-visual-files`
- Repositório GitHub: `mkng-visual-control`

O sistema não deve compartilhar banco ou bucket com o SERFlux.

## 2. Atualizar o `wrangler.jsonc`

Substitua:

```text
SUBSTITUA_PELO_DATABASE_ID
```

pelo ID real do banco D1. Ajuste também `APP_URL` após o primeiro deploy.

## 3. Aplicar as migrações

Após clonar o repositório localmente ou usando o terminal do ambiente de desenvolvimento:

```bash
npm install
npx wrangler d1 migrations apply mkng-visual-db --remote
```

As migrações criam todas as tabelas e as categorias iniciais de materiais.

## 4. Configurar segredos

No Worker, acesse **Configurações → Variáveis e segredos** e adicione como segredos:

```text
INITIAL_ADMIN_NAME
INITIAL_ADMIN_EMAIL
INITIAL_ADMIN_PASSWORD
SESSION_SECRET
```

A senha deve ter pelo menos 10 caracteres. O `SESSION_SECRET` deve ser uma sequência longa e aleatória.

## 5. Conectar ao GitHub

Configuração recomendada na Cloudflare:

```text
Comando de build: npm run build
Comando de implantação: npx wrangler deploy
Diretório raiz: /
Branch de produção: main
```

O `wrangler.jsonc` contém o Worker, D1, R2 e os assets estáticos.

## 6. Primeiro teste

1. Abra a URL `workers.dev`.
2. Entre com o e-mail e a senha do administrador inicial.
3. Cadastre um cliente.
4. Cadastre um fornecedor.
5. Cadastre um material com saldo zero.
6. Registre uma compra e confirme o recebimento.
7. Verifique a entrada no estoque.
8. Crie um pedido com reserva de material.
9. Confirme o consumo na OS.
10. Verifique a baixa e gere os relatórios PDF.

## 7. Domínio personalizado

Após a validação no endereço `workers.dev`, associe um subdomínio, por exemplo:

```text
visual.mkngsolucoes.com.br
```

ou outro domínio definido pela MKNG.

## 8. Backup e segurança

- Mantenha observabilidade habilitada.
- Restrinja usuários por função.
- Não armazene senhas em arquivos do repositório.
- Use segredos da Cloudflare.
- Exporte dados do D1 antes de alterações estruturais relevantes.
- Faça testes de restauração do banco e do R2 antes do uso crítico.
