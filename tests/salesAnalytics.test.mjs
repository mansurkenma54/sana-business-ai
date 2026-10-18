import test from "node:test";
import assert from "node:assert/strict";
import { parseSalesCsv, analyzeSales, DEMO_SALES_CSV, MAX_CSV_BYTES } from "../frontend/src/salesAnalytics.js";

const header = "date,product,quantity,price,cost";
const csv = (...rows) => `${header}\n${rows.join("\n")}`;
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("semicolon export accepts BOM, decimal commas, grouped numbers and reordered columns", () => {
  const rows = parseSalesCsv('\uFEFFproduct;cost;date;price;quantity\r\n"Кофе; большой";450,25;2024-02-29;1 200,50;2,5\r\n');
  assert.deepEqual(rows, [{ date: "2024-02-29", product: "Кофе; большой", quantity: 2.5, price: 1200.5, cost: 450.25 }]);
  const result = analyzeSales(rows);
  assert.equal(result.revenue, 3001.25);
  assert.equal(result.costs, 1125.625);
  assert.equal(result.profit, 1875.625);
});

test("quoted products preserve commas, escaped quotes and line breaks", () => {
  const rows = parseSalesCsv(csv('2026-10-01,"Кофе, ""Авторский""",1,100,30', '2026-10-02,"Набор\nподарочный",2,50,20'));
  assert.equal(rows[0].product, 'Кофе, "Авторский"');
  assert.equal(rows[1].product, "Набор\nподарочный");
  assert.equal(analyzeSales(rows).revenue, 200);
});

test("malformed quoting and inconsistent columns are rejected", () => {
  for (const row of [
    '2026-10-01,"Кофе,1,100,30',
    '2026-10-01,"Кофе"extra,1,100,30',
    '2026-10-01,Ко"фе,1,100,30',
    '2026-10-01,Кофе,1,100',
    '2026-10-01,Кофе,1,100,30,extra',
  ]) assert.throws(() => parseSalesCsv(csv(row)), /кавыч|столбцов/i);
});

test("calendar validation rejects impossible and non-ISO dates", () => {
  for (const date of ["2025-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "01.10.2026", "2026-1-01"]) {
    assert.throws(() => parseSalesCsv(csv(`${date},Кофе,1,100,30`)), /дата/i);
  }
  assert.equal(parseSalesCsv(csv("2024-02-29,Кофе,1,100,30"))[0].date, "2024-02-29");
});

test("empty sales, missing columns, duplicate columns and blank product fail clearly", () => {
  for (const source of ["", "  \n ", header]) assert.throws(() => parseSalesCsv(source));
  assert.throws(() => parseSalesCsv("date,product,quantity,price\n2026-10-01,A,1,20"), /столбцы/);
  assert.throws(() => parseSalesCsv("date,product,quantity,price,cost,DATE\n2026-10-01,A,1,20,10,2026-10-01"), /уникальные/);
  assert.throws(() => parseSalesCsv(csv("2026-10-01,,1,20,10")), /название/);
  assert.throws(() => parseSalesCsv(csv(`2026-10-01,${"a".repeat(161)},1,20,10`)), /название/);
});

test("numeric bounds permit zero and the maximum but reject negatives and non-decimal numbers", () => {
  assert.deepEqual(parseSalesCsv(csv("2026-10-01,A,0,100000000,0"))[0], { date: "2026-10-01", product: "A", quantity: 0, price: 100000000, cost: 0 });
  for (const bad of ["-1", "100000001", "Infinity", "NaN", "1e3", "0x10", "", "+1"]) {
    assert.throws(() => parseSalesCsv(csv(`2026-10-01,A,1,${bad},10`)), /числом/);
  }
});

test("file and row limits count UTF-8 bytes and permit exactly 10000 sales", () => {
  assert.equal(MAX_CSV_BYTES, 1024 * 1024);
  const multibyte = "я".repeat(MAX_CSV_BYTES / 2 + 1);
  assert.throws(() => parseSalesCsv(multibyte), /1 МБ/);
  const row = "2026-10-01,A,1,20,10";
  assert.equal(parseSalesCsv(csv(...Array(10000).fill(row))).length, 10000);
  assert.throws(() => parseSalesCsv(csv(...Array(10001).fill(row))), /10 000/);
});

test("revenue, unit costs and weighted margin aggregate across products and dates", () => {
  const rows = parseSalesCsv(csv("2026-10-03,A,1,150,80", "2026-10-01,A,2,100,60", "2026-10-02,B,3,80,70"));
  const result = analyzeSales(rows);
  assert.equal(result.revenue, 590);
  assert.equal(result.costs, 410);
  assert.equal(result.profit, 180);
  assert.equal(result.quantity, 6);
  assert.equal(result.rows, 3);
  closeTo(result.margin, 180 / 590 * 100);
  assert.deepEqual(result.timeline, [
    { date: "2026-10-01", revenue: 200, costs: 120 },
    { date: "2026-10-02", revenue: 240, costs: 210 },
    { date: "2026-10-03", revenue: 150, costs: 80 },
  ]);
  assert.deepEqual(result.products.map(({ name, revenue, costs, profit }) => ({ name, revenue, costs, profit })), [
    { name: "A", revenue: 350, costs: 200, profit: 150 },
    { name: "B", revenue: 240, costs: 210, profit: 30 },
  ]);
  closeTo(result.products.reduce((sum, product) => sum + product.share, 0), 100);
  assert.equal(result.periodStart, "2026-10-01");
  assert.equal(result.periodEnd, "2026-10-03");
});

test("date filtering is inclusive, changes metrics and excludes unrelated alerts", () => {
  const rows = parseSalesCsv(csv("2026-10-01,Loss,1,10,100", "2026-10-02,Good,2,100,40", "2026-10-03,Good,3,100,40"));
  const result = analyzeSales(rows, "2026-10-02", "2026-10-02");
  assert.equal(result.rows, 1);
  assert.equal(result.revenue, 200);
  assert.equal(result.costs, 80);
  assert.equal(result.profit, 120);
  assert.equal(result.margin, 60);
  assert.deepEqual(result.products.map(product => product.name), ["Good"]);
  assert.ok(!result.alerts.some(alert => alert.title.includes("отрицательной")));
  assert.equal(analyzeSales(rows, "2026-10-02").rows, 2);
  assert.equal(analyzeSales(rows, "", "2026-10-02").rows, 2);
});

test("empty or filtered-out data returns empty metrics without misleading alerts", () => {
  for (const result of [analyzeSales([]), analyzeSales(parseSalesCsv(csv("2026-10-01,A,1,10,5")), "2026-11-01", "2026-11-30")]) {
    assert.equal(result.rows, 0);
    assert.equal(result.revenue, 0);
    assert.equal(result.costs, 0);
    assert.equal(result.profit, 0);
    assert.equal(result.margin, null);
    assert.deepEqual(result.products, []);
    assert.deepEqual(result.timeline, []);
    assert.deepEqual(result.alerts, []);
    assert.equal(result.periodStart, "");
    assert.equal(result.periodEnd, "");
  }
});

test("zero margin and loss-making sales remain visible without clamping profit", () => {
  const result = analyzeSales(parseSalesCsv(csv("2026-10-01,BreakEven,2,100,100", "2026-10-01,Loss,1,50,80")));
  assert.equal(result.revenue, 250);
  assert.equal(result.costs, 280);
  assert.equal(result.profit, -30);
  assert.equal(result.margin, -12);
  assert.equal(result.products.find(product => product.name === "BreakEven").margin, 0);
  assert.equal(result.products.find(product => product.name === "Loss").margin, -60);
  assert.ok(result.alerts.some(alert => alert.title === "Продажи с отрицательной маржой" && alert.text.includes("Loss")));
  assert.ok(result.alerts.some(alert => alert.title === "Проверьте низкую маржу" && alert.text.includes("BreakEven")));
});

test("zero revenue has no percentage margin even when free items cost money", () => {
  const result = analyzeSales(parseSalesCsv(csv("2026-10-01,Sample,2,0,10")));
  assert.equal(result.revenue, 0);
  assert.equal(result.profit, -20);
  assert.equal(result.margin, null);
  assert.equal(result.products[0].margin, null);
  assert.equal(result.products[0].share, 0);
  assert.ok(!result.alerts.some(alert => alert.title.includes("одного продукта")));
});

test("diagnostic thresholds are strict and do not treat 20% margin or 60% share as breaches", () => {
  const result = analyzeSales(parseSalesCsv(csv("2026-10-01,A,1,60,48", "2026-10-01,B,1,40,32")));
  assert.equal(result.margin, 20);
  assert.equal(result.products[0].share, 60);
  assert.deepEqual(result.alerts.map(alert => alert.tone), ["info"]);
});

test("demo fixture has independently checked totals and a loss-making sandwich", () => {
  const result = analyzeSales(parseSalesCsv(DEMO_SALES_CSV));
  assert.equal(result.rows, 28);
  assert.equal(result.quantity, 551);
  assert.equal(result.revenue, 702900);
  assert.equal(result.costs, 392200);
  assert.equal(result.profit, 310700);
  assert.equal(result.products.find(product => product.name === "Сэндвич").profit, -7300);
  assert.equal(result.timeline.length, 7);
});
