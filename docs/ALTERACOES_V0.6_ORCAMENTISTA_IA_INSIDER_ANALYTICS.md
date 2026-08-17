# MKNG Visual Control v0.6.0

## Orçamentista IA, Insider e Analytics de Mercado

Esta versão adiciona uma central de inteligência comercial sem substituir o fluxo existente de Pedidos/OS da v0.5.

## O que foi adicionado

### Orçamentista IA
- Campo de briefing em linguagem natural.
- Estrutura automática de itens, quantidades e medidas.
- Cálculo por m² ou por unidade.
- Custo padrão por m² configurável em cada orçamento.
- Markup sobre custo configurável por item e por orçamento.
- Comparação rápida entre 100%, percentual atual e 200% sobre o custo.
- Cálculo de área total, custo, venda, lucro bruto e margem sobre venda.

### Insider
- Análise determinística de risco mesmo sem IA externa.
- Margem sobre venda.
- Simulação de desconto de 10%.
- Lucro remanescente após desconto.
- Alertas quando custo está incompleto ou preço está fora da faixa pesquisada.
- Com OPENAI_API_KEY configurada, pode acrescentar análise textual do Insider IA.

### Analytics de Mercado
- Pesquisa web através da OpenAI Responses API com ferramenta web_search.
- Retorno de faixa baixa, mediana, faixa alta e referência recomendada.
- Nível de confiança da pesquisa.
- Armazenamento das fontes consultadas e do histórico de pesquisas.
- O preço de mercado é tratado como referência e nunca substitui automaticamente o preço interno.

### PDFs
- PDF comercial sem exposição de custo interno.
- PDF de memória de cálculo com custo, markup, venda e lucro.
- O documento interno recebe a indicação `CONTROLE INTERNO — NÃO ENCAMINHAR AO CLIENTE`.
- Identidade visual segue as configurações atuais da MKNG.

## Banco de dados

Nova migration:

```bash
npm run db:migrate:remote
```

Arquivo: `migrations/0007_pricing_intelligence.sql`

Tabelas novas:
- `pricing_quotes`
- `pricing_quote_items`
- `pricing_scenarios`
- `pricing_market_research`
- `pricing_ai_runs`

## Configuração da IA

A chave nunca deve ser gravada no repositório ou no frontend.

No Cloudflare Wrangler:

```bash
wrangler secret put OPENAI_API_KEY
```

O modelo pode ser alterado pela variável `OPENAI_PRICING_MODEL`. A configuração inicial da v0.6 usa `gpt-5.6`.

Sem `OPENAI_API_KEY`:
- cálculo de custos funciona;
- cenários funcionam;
- PDFs funcionam;
- histórico e analytics internos funcionam;
- Insider determinístico funciona;
- Orçamentista IA e pesquisa web informam que a integração ainda não está configurada.

## Permissões

A central de inteligência comercial fica disponível para:
- Super Admin
- Administrador
- Gestor
- Financeiro

Produção, Estoque e Consulta não recebem acesso aos custos e margens do módulo.

## Segurança arquitetural

O `src/worker.ts` da v0.5 permanece intacto.

A v0.6 usa `src/worker-v06.ts` como ponto de entrada. Esse arquivo registra apenas `/api/pricing/*` e delega as demais rotas para o worker legado. Isso reduz risco de regressão e facilita rollback.

## Observação sobre preço de mercado

Comparações externas não são equivalentes a uma tabela oficial. Material, substrato, acabamento, instalação, frete, criação de arte, prazo, região e volume alteram o preço. O sistema mostra a evidência e o nível de confiança para que a decisão final continue sob responsabilidade do usuário.
