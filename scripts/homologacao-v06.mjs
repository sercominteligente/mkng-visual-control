import assert from "node:assert/strict";

const items = [
  { description: "Bottons 10 x 10 cm", quantity: 50000, width_cm: 10, height_cm: 10 },
  { description: "Leitosos 10 x 30 cm", quantity: 10000, width_cm: 10, height_cm: 30 },
  { description: "Perfurados 80 x 40 cm", quantity: 1000, width_cm: 80, height_cm: 40 },
];

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

function calculate(markupPct) {
  const costPerM2 = 17;
  const rows = items.map((item) => {
    const unitAreaM2 = round((item.width_cm / 100) * (item.height_cm / 100), 6);
    const totalAreaM2 = round(unitAreaM2 * item.quantity, 4);
    const unitCost = round(unitAreaM2 * costPerM2, 4);
    const lineCost = round(unitCost * item.quantity, 2);
    const factor = 1 + markupPct / 100;
    const unitPrice = round(unitCost * factor, 4);
    const lineTotal = round(lineCost * factor, 2);
    return { ...item, unitAreaM2, totalAreaM2, unitCost, lineCost, unitPrice, lineTotal };
  });
  const totalAreaM2 = round(rows.reduce((sum, row) => sum + row.totalAreaM2, 0), 4);
  const productionCost = round(rows.reduce((sum, row) => sum + row.lineCost, 0), 2);
  const saleTotal = round(rows.reduce((sum, row) => sum + row.lineTotal, 0), 2);
  const grossProfit = round(saleTotal - productionCost, 2);
  const marginPct = round((grossProfit / saleTotal) * 100, 2);
  return { rows, totalAreaM2, productionCost, saleTotal, grossProfit, marginPct };
}

const p100 = calculate(100);
assert.equal(p100.totalAreaM2, 1120);
assert.equal(p100.productionCost, 19040);
assert.equal(p100.saleTotal, 38080);
assert.equal(p100.grossProfit, 19040);
assert.equal(p100.marginPct, 50);
assert.equal(p100.rows[0].unitPrice, 0.34);
assert.equal(p100.rows[1].unitPrice, 1.02);
assert.equal(p100.rows[2].unitPrice, 10.88);

const p200 = calculate(200);
assert.equal(p200.totalAreaM2, 1120);
assert.equal(p200.productionCost, 19040);
assert.equal(p200.saleTotal, 57120);
assert.equal(p200.grossProfit, 38080);
assert.equal(p200.marginPct, 66.67);
assert.equal(p200.rows[0].unitPrice, 0.51);
assert.equal(p200.rows[1].unitPrice, 1.53);
assert.equal(p200.rows[2].unitPrice, 16.32);

console.log("HOMOLOGAÇÃO MKNG v0.6 APROVADA");
console.log(JSON.stringify({
  area_total_m2: p200.totalAreaM2,
  custo_total: p200.productionCost,
  cenario_100: { venda: p100.saleTotal, lucro: p100.grossProfit, margem_venda_pct: p100.marginPct },
  cenario_200: { venda: p200.saleTotal, lucro: p200.grossProfit, margem_venda_pct: p200.marginPct },
}, null, 2));
