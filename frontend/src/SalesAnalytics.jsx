import { useRef, useState } from "react";
import { analyzeSales, parseSalesCsv, DEMO_SALES_CSV, MAX_CSV_BYTES } from "./salesAnalytics.js";
import "./sales.css";

const money = value => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₸`;
const percent = value => value === null ? "—" : `${value.toFixed(1)}%`;

function download(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SalesAnalytics({ onCreateTask }) {
  const [records, setRecords] = useState([]);
  const [name, setName] = useState("");
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [industry, setIndustry] = useState("cafe");
  const inputRef = useRef(null);
  const validPeriod = !from || !to || from <= to;
  const result = analyzeSales(records, from, to);

  function load(text, filename, isDemo) {
    const next = parseSalesCsv(text);
    setRecords(next); setName(filename); setDemo(isDemo); setError(""); setFrom(""); setTo("");
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError("");
    // A failed replacement must not leave old figures presented as the new file.
    setRecords([]); setName(""); setDemo(false);
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error("Максимальный размер файла — 1 МБ.");
      if (!/\.csv$/i.test(file.name)) throw new Error("Нужен файл .csv в кодировке UTF-8.");
      load(await file.text(), file.name, false);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); event.target.value = ""; }
  }
  function prepareTask() {
    const problems = result.alerts.map(item => `${item.title}: ${item.text}`).join("\n");
    const draft = `${demo ? "ДЕМОНСТРАЦИОННЫЙ ПРИМЕР — заменить цифры своими.\n" : "Данные из моей выгрузки продаж.\n"}Период: ${result.periodStart} — ${result.periodEnd}. Выручка: ${money(result.revenue)}, себестоимость проданного: ${money(result.costs)}, валовая прибыль: ${money(result.profit)}; маржа: ${percent(result.margin)}.\nНаблюдения по правилам:\n${problems}\nХочу автоматизировать контроль продаж и маржи. Необходимо согласовать исходные показатели, цель и критерии приёмки пилота. Бюджет и срок пока не заданы.`;
    onCreateTask(draft, industry);
  }

  return <section className="sales-lab bh-view" aria-labelledby="sales-title">
    <div className="bh-section-heading"><div><span className="bh-eyebrow">ДАННЫЕ ВМЕСТО ДОГАДОК</span><h2 id="sales-title">Где бизнес теряет маржу?</h2></div><p>Загрузите выгрузку продаж. За несколько секунд получите расчёт и конкретные сигналы для проверки.</p></div>
    <div className="sales-upload">
      <div className="sales-upload-symbol" aria-hidden="true">↗</div>
      <div><strong>Ваша касса → понятный отчёт</strong><p>CSV UTF-8 · до 1 МБ · до 10 000 строк · все суммы в тенге</p></div>
      <div className="sales-upload-actions"><input ref={inputRef} className="sales-file-input" type="file" accept=".csv,text/csv" onChange={upload} aria-label="Выбрать CSV с продажами" /><button className="bh-button bh-button-dark" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Читаем файл…" : "Загрузить CSV"}<span aria-hidden="true">↑</span></button><button className="bh-text-button" disabled={busy} onClick={() => load(DEMO_SALES_CSV, "Демо · кофейня, 7 дней", true)}>Попробовать на примере →</button></div>
    </div>
    <div className="sales-privacy"><span aria-hidden="true">◉</span><p>Файл обрабатывается только в вашем браузере, без отправки на сервер. Расчёты и рекомендации основаны на формулах и правилах, а не на ответе AI-модели.</p></div>
    <details className="sales-format"><summary>Формат файла и методика расчёта</summary><div><p>Одна строка — продажа одного продукта. Столбцы: <code>date</code> — дата YYYY-MM-DD, <code>product</code> — продукт, <code>quantity</code> — количество, <code>price</code> — цена за единицу, <code>cost</code> — себестоимость за единицу. Разделитель — запятая или точка с запятой. Для дробной запятой используйте точку с запятой как разделитель.</p><p>Выручка = количество × цена. Себестоимость проданного = количество × себестоимость единицы. Валовая прибыль = выручка − себестоимость проданного. Маржа = валовая прибыль / выручка × 100%. Аренда, зарплаты, налоги и другие операционные расходы в эту прибыль не включены. Возвраты с отрицательным количеством не поддерживаются.</p><p>Все строки файла участвуют в расчёте, включая совпадающие продажи. Пропущенные даты не считаются нулевыми продажами. Отчёт не является прогнозом спроса.</p><button className="bh-text-button" onClick={() => download("sana-sales-example.csv", "\uFEFF" + DEMO_SALES_CSV, "text/csv;charset=utf-8")}>Скачать пример CSV ↓</button></div></details>
    {error && <div className="sales-error" role="alert">{error}</div>}
    {!records.length && !busy && <div className="sales-empty"><div aria-hidden="true" className="sales-empty-chart"><i/><i/><i/><i/><i/></div><h3>У каждой продажи есть история</h3><p>Узнайте, какие продукты приносят выручку, а какие съедают маржу. Начните с демо или своего файла.</p><div><span>01 / Загрузите</span><span>02 / Проверьте сигналы</span><span>03 / Запустите пилот</span></div></div>}
    {records.length > 0 && <>
      <div className="sales-report-heading"><div><span className={`sales-file-badge ${demo ? "is-demo" : ""}`}>{demo ? "ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ" : "ВАШ ФАЙЛ · ЛОКАЛЬНЫЙ РАСЧЁТ"}</span><h3>{name}</h3></div><button className="bh-text-button" onClick={() => { setRecords([]); setName(""); setError(""); }}>Очистить отчёт ×</button></div>
      <div className="sales-filters"><label>Период с<input type="date" aria-label="Период продаж с" value={from} onChange={event => setFrom(event.target.value)}/></label><label>По<input type="date" aria-label="Период продаж по" value={to} onChange={event => setTo(event.target.value)}/></label><button className="bh-text-button" onClick={() => { setFrom(""); setTo(""); }}>Весь период</button><span>{result.rows} строк · {result.timeline.length} дней с данными</span></div>
      {!validPeriod ? <p role="alert" className="sales-error">Дата начала должна быть не позже даты окончания.</p> : !result.rows ? <p className="sales-error" role="status">В выбранном периоде нет продаж. Измените даты.</p> : <>
        <div className="sales-kpis"><article><span>Выручка</span><strong>{money(result.revenue)}</strong><small>{result.quantity.toLocaleString("ru-RU")} единиц продано</small></article><article><span>Себестоимость проданного</span><strong>{money(result.costs)}</strong><small>По значениям в файле</small></article><article className={result.profit < 0 ? "sales-loss" : "sales-highlight"}><span>Валовая прибыль</span><strong>{money(result.profit)}</strong><small>До операционных расходов и налогов</small></article><article><span>Валовая маржа</span><strong>{percent(result.margin)}</strong><small>При нулевой выручке не вычисляется</small></article></div>
        <div className="sales-analysis-grid"><section className="sales-panel"><header><span className="bh-eyebrow">СТРУКТУРА ВЫРУЧКИ</span><h3>Что покупают</h3></header><div className="sales-product-bars">{result.products.slice(0, 6).map(product => <div key={product.name}><div><strong>{product.name}</strong><span>{money(product.revenue)}</span></div><div className="sales-bar-track"><span style={{ width: `${product.share}%` }}/></div><small>{percent(product.share)} выручки · маржа {percent(product.margin)}</small></div>)}</div>{result.products.length > 6 && <p>Показаны 6 лидеров. Полный список — в таблице.</p>}</section><section className="sales-panel sales-signals"><header><span className="bh-eyebrow">СИГНАЛЫ ДЛЯ ВЛАДЕЛЬЦА</span><h3>На что обратить внимание</h3></header>{result.alerts.map((alert, index) => <article className={`sales-signal sales-${alert.tone}`} key={alert.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h4>{alert.title}</h4><p>{alert.text}</p><small>Метрика: {alert.metric}</small></div></article>)}</section></div>
        <section className="sales-panel sales-table-panel"><header><div><span className="bh-eyebrow">ПРОЗРАЧНЫЙ РАСЧЁТ</span><h3>Экономика каждого продукта</h3></div><button className="bh-text-button" onClick={() => download("sana-sales-report.json", JSON.stringify({ generated_at: new Date().toISOString(), source: demo ? "demo" : "user_csv", methodology: "Детерминированный расчёт. Валовая прибыль не включает операционные расходы и налоги.", ...result }, null, 2), "application/json")}>Скачать отчёт ↓</button></header><div className="sales-table-scroll" tabIndex="0" role="region" aria-label="Таблица продаж, можно прокрутить по горизонтали"><table><thead><tr><th scope="col">Продукт</th><th scope="col">Кол-во</th><th scope="col">Выручка</th><th scope="col">Себестоимость</th><th scope="col">Валовая прибыль</th><th scope="col">Маржа</th></tr></thead><tbody>{result.products.map(product => <tr key={product.name}><th scope="row">{product.name}</th><td>{product.quantity.toLocaleString("ru-RU")}</td><td>{money(product.revenue)}</td><td>{money(product.costs)}</td><td className={product.profit < 0 ? "sales-negative" : ""}>{money(product.profit)}</td><td>{percent(product.margin)}</td></tr>)}</tbody></table></div></section>
        <div className="sales-next"><div><span className="bh-eyebrow">ОТ НАБЛЮДЕНИЯ К ДЕЙСТВИЮ</span><h3>Превратите отчёт в задачу на внедрение</h3><p>В конструктор попадут только сводные показатели и сигналы. Проверьте их перед публикацией. Для передачи в конструктор нужен аккаунт бизнеса.</p></div><div><label>Сфера бизнеса<select value={industry} onChange={event => setIndustry(event.target.value)}><option value="cafe">Кафе и рестораны</option><option value="retail">Магазины и торговля</option><option value="beauty">Салоны красоты</option><option value="service">Услуги и мастерские</option><option value="agriculture">Фермерство</option><option value="tourism">Туризм</option></select></label><button className="bh-button bh-button-dark" onClick={prepareTask}>Подготовить задачу →</button></div></div>
      </>}
    </>}
  </section>;
}
