const REQUIRED_COLUMNS = ["date", "product", "quantity", "price", "cost"];
export const MAX_CSV_BYTES = 1024 * 1024;

function parseRows(source, delimiter) {
  const rows = [];
  let row = [], value = "", quoted = false, closedQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { value += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else value += character;
    } else if (character === delimiter || character === "\n" || character === "\r") {
      row.push(value.trim()); value = ""; closedQuote = false;
      if (character !== delimiter) {
        if (row.some(cell => cell !== "")) rows.push(row);
        row = [];
        if (character === "\r" && source[index + 1] === "\n") index += 1;
      }
    } else if (character === '"' && !value.trim() && !closedQuote) {
      value = ""; quoted = true;
    } else if (closedQuote && character.trim()) {
      throw new Error("Некорректные кавычки в CSV. Сохраните файл в формате CSV UTF-8.");
    } else if (character === '"') {
      throw new Error("Кавычки внутри значения CSV должны быть удвоены.");
    } else value += character;
    if (rows.length > 10001) throw new Error("Допускается не более 10 000 строк продаж.");
  }
  if (quoted) throw new Error("В CSV найдена незакрытая кавычка.");
  row.push(value.trim());
  if (row.some(cell => cell !== "")) rows.push(row);
  return rows;
}

export function parseSalesCsv(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Файл пуст. Загрузите CSV с продажами.");
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) throw new Error("Файл должен быть не больше 1 МБ.");
  const source = text.replace(/^\uFEFF/, "");
  const headerLine = source.split(/\r?\n/)[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const rows = parseRows(source, delimiter);
  const header = rows.shift()?.map(value => value.toLowerCase()) || [];
  if (!REQUIRED_COLUMNS.every(column => header.includes(column)) || new Set(header).size !== header.length) {
    throw new Error("Нужны уникальные столбцы date, product, quantity, price, cost. Скачайте пример формата.");
  }
  if (!rows.length) throw new Error("В файле есть заголовок, но нет продаж.");
  if (rows.length > 10000) throw new Error("Допускается не более 10 000 строк продаж.");
  return rows.map((cells, index) => {
    const line = index + 2;
    if (cells.length !== header.length) throw new Error(`Строка ${line}: число столбцов не совпадает с заголовком.`);
    const record = Object.fromEntries(header.map((key, position) => [key, cells[position]]));
    const date = new Date(`${record.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== record.date) {
      throw new Error(`Строка ${line}: дата должна быть реальной датой в формате YYYY-MM-DD.`);
    }
    if (!record.product || record.product.length > 160) throw new Error(`Строка ${line}: укажите название продукта до 160 символов.`);
    const number = key => {
      const input = record[key].replace(/\s/g, "").replace(",", ".");
      const value = Number(input);
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input) || !Number.isFinite(value) || value < 0 || value > 100000000) {
        throw new Error(`Строка ${line}: ${key} должно быть числом от 0 до 100 000 000. Возвраты с минусом не поддерживаются.`);
      }
      return value;
    };
    return { date: record.date, product: record.product, quantity: number("quantity"), price: number("price"), cost: number("cost") };
  });
}

export function analyzeSales(records, from = "", to = "") {
  const selected = records.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
  const products = new Map(), days = new Map();
  let revenue = 0, costs = 0, quantity = 0;
  for (const row of selected) {
    const sale = row.quantity * row.price, expense = row.quantity * row.cost;
    revenue += sale; costs += expense; quantity += row.quantity;
    const product = products.get(row.product) || { name: row.product, quantity: 0, revenue: 0, costs: 0 };
    product.quantity += row.quantity; product.revenue += sale; product.costs += expense;
    products.set(row.product, product);
    const day = days.get(row.date) || { date: row.date, revenue: 0, costs: 0 };
    day.revenue += sale; day.costs += expense; days.set(row.date, day);
  }
  const ranked = [...products.values()].map(product => ({ ...product, profit: product.revenue - product.costs, margin: product.revenue ? (product.revenue - product.costs) / product.revenue * 100 : null, share: revenue ? product.revenue / revenue * 100 : 0 })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const timeline = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const alerts = [];
  const lossProducts = ranked.filter(product => product.profit < 0);
  if (lossProducts.length) alerts.push({ tone: "warning", title: "Продажи с отрицательной маржой", text: `${lossProducts.map(product => product.name).join(", ")}: себестоимость выше выручки. Проверьте данные, скидки и закупочную цену до изменения цен.`, metric: "Валовая маржа по продукту, %" });
  const thinProducts = ranked.filter(product => product.margin !== null && product.margin >= 0 && product.margin < 20);
  if (thinProducts.length) alerts.push({ tone: "attention", title: "Проверьте низкую маржу", text: `${thinProducts.map(product => product.name).join(", ")}: маржа ниже выбранного порога 20%. Это диагностический порог, не отраслевая норма. Сравните закупки и условия поставщиков.`, metric: "Себестоимость единицы, ₸" });
  if (ranked[0]?.share > 60) alerts.push({ tone: "attention", title: "Выручка зависит от одного продукта", text: `${ranked[0].name} даёт ${ranked[0].share.toFixed(1)}% выручки в выбранных данных. Проверьте наличие этого продукта и устойчивость поставок.`, metric: "Доля продукта в выручке, %" });
  if (selected.length) alerts.push({ tone: "info", title: "Автоматизируйте еженедельный контроль", text: "Повторяйте эту проверку на выгрузке кассы. Сравнивайте одинаковые периоды и фиксируйте валовую маржу до и после пилота. Решение по закупкам и ценам принимает владелец.", metric: "Время на отчёт, часов в неделю" });
  return { revenue, costs, profit: revenue - costs, margin: revenue ? (revenue - costs) / revenue * 100 : null, quantity, rows: selected.length, products: ranked, timeline, alerts, periodStart: timeline[0]?.date || "", periodEnd: timeline.at(-1)?.date || "" };
}

export const DEMO_SALES_CSV = `date,product,quantity,price,cost
2026-10-01,Капучино,24,1200,420
2026-10-01,Латте,18,1400,490
2026-10-01,Круассан,15,900,780
2026-10-01,Сэндвич,8,1800,1900
2026-10-02,Капучино,30,1200,420
2026-10-02,Латте,22,1400,490
2026-10-02,Круассан,12,900,780
2026-10-02,Сэндвич,10,1800,1900
2026-10-03,Капучино,28,1200,420
2026-10-03,Латте,25,1400,490
2026-10-03,Круассан,19,900,780
2026-10-03,Сэндвич,11,1800,1900
2026-10-04,Капучино,35,1200,420
2026-10-04,Латте,27,1400,490
2026-10-04,Круассан,21,900,780
2026-10-04,Сэндвич,12,1800,1900
2026-10-05,Капучино,23,1200,420
2026-10-05,Латте,20,1400,490
2026-10-05,Круассан,14,900,780
2026-10-05,Сэндвич,9,1800,1900
2026-10-06,Капучино,29,1200,420
2026-10-06,Латте,24,1400,490
2026-10-06,Круассан,16,900,780
2026-10-06,Сэндвич,10,1800,1900
2026-10-07,Капучино,32,1200,420
2026-10-07,Латте,26,1400,490
2026-10-07,Круассан,18,900,780
2026-10-07,Сэндвич,13,1800,1900
`;
