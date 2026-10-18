import { useEffect, useMemo, useRef, useState } from "react";
import SalesAnalytics from "./SalesAnalytics.jsx";
import { INPUT_LIMITS, calculateImpact, comparePilot } from "./businessMath.js";
import "./business.css";
export { calculateImpact } from "./businessMath.js";

const STORAGE_KEY = "sana.business.workspace.v1";
const INDUSTRIES = { cafe: "Кафе и рестораны", retail: "Магазины и торговля", beauty: "Красота и здоровье", service: "Услуги и мастерские", agriculture: "Агро и производство", tourism: "Туризм и гостеприимство" };
const INDUSTRY_ICONS = { cafe: "coffee", retail: "bag", beauty: "spark", service: "tool", agriculture: "leaf", tourism: "pin" };
const GOALS = { revenue: "Увеличить выручку", costs: "Снизить расходы", time: "Освободить время" };
const INITIAL_PROFILE = { business_name: "", city: "Тараз", industry: "cafe", goal: "revenue", challenge: "", locale: "ru" };
const DEFAULT_ASSUMPTIONS = { monthly_revenue: 3000000, monthly_costs: 1200000, gross_margin_pct: 35, hours_per_week: 20, hourly_cost: 2000, revenue_growth_pct: 5, cost_reduction_pct: 4, automation_pct: 50, setup_cost: 150000, monthly_tool_cost: 15000 };
const DEFAULT_PILOT = { metric: "Повторные покупки за месяц", unit: "покупок", direction: "higher", baseline: "", target: "", actual: "" };
const CITIES = ["Тараз", "Шу", "Каратау", "Жанатас", "Байзакский район", "Жамбылский район", "Жуалынский район", "Кордайский район", "Меркенский район", "Мойынкумский район", "Район Т. Рыскулова", "Сарысуский район", "Таласский район", "Шуский район"];
const money = (value) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₸`;
const decimal = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);

function Glyph({ name = "arrow", className = "" }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    northeast: <path d="M6 18 18 6M6 6h12v12" />,
    spark: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z" /></>,
    coffee: <><path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM16 10h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2M3 22h16" /></>,
    bag: <><path d="M5 7h14l2 14H3ZM8 9V6a4 4 0 0 1 8 0v3" /></>,
    tool: <><path d="m14 6 4 4m-8 0L3 17a3 3 0 0 0 4 4l7-7M14 3a7 7 0 0 0-4 10 7 7 0 0 0 10-4l-5 1-2-2Z" /></>,
    leaf: <><path d="M20 3C7 2 2 9 5 16s16 5 15-13ZM4 21 16 8M8 16v-5m4 1h5" /></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chart: <><path d="M4 3v17h17M8 15l4-5 4 2 5-7" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    save: <><path d="M5 3h12l4 4v14H3V3ZM7 3v6h9V3M7 21v-8h10v8" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6" /></>,
  };
  return <svg className={`bh-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.arrow}</svg>;
}

function SectionHeading({ number, eyebrow, title, children }) {
  return <div className="bh-section-heading"><div><span className="bh-eyebrow">{number && <span>{number} / </span>}{eyebrow}</span><h2>{title}</h2></div>{children && <p>{children}</p>}</div>;
}

function NumericField({ label, suffix, value, onChange, max, hint }) {
  return <label className="bh-field"><span>{label}</span><div className="bh-number-input"><input type="number" inputMode="decimal" min="0" max={max} step="any" required value={value} onChange={(event) => onChange(event.target.value)} /><span>{suffix}</span></div>{hint && <small>{hint}</small>}</label>;
}

function SourceTag({ source }) {
  return <span className={`bh-source ${source === "openai" ? "bh-source-ai" : ""}`}><span />{source === "openai" ? "Приоритеты определены AI" : "Режим правил · без AI-модели"}</span>;
}

function safeText(value, max = 4000) { return typeof value === "string" ? value.slice(0, max) : ""; }
function safeList(value) { return Array.isArray(value) ? value : []; }
function textOf(value) { return typeof value === "string" ? value : value?.description || value?.text || value?.title || ""; }

function readDiagnostic(value) {
  if (!value || typeof value !== "object" || typeof value.summary !== "string" || typeof value.task_draft !== "string" || !["openai", "fallback"].includes(value.source)) {
    throw new Error("Не удалось прочитать результат анализа. Запустите диагностику ещё раз.");
  }
  return {
    source: value.source,
    summary: safeText(value.summary),
    task_draft: safeText(value.task_draft, 12000),
    opportunities: safeList(value.opportunities).slice(0, 12).filter((item) => item && typeof item.title === "string").map((item) => ({ title: safeText(item.title, 250), description: safeText(item.description), metric: safeText(item.metric, 1000), kpi: safeText(item.kpi, 1000), effort: safeText(item.effort, 300), first_step: safeText(item.first_step) })),
    plan: safeList(value.plan || value.four_week_plan).slice(0, 4).filter((item) => item && typeof item.title === "string").map((item, index) => ({ week: index + 1, title: safeText(item.title, 250), actions: safeList(item.actions).slice(0, 10).filter((action) => typeof action === "string").map((action) => safeText(action, 2000)) })),
    questions: safeList(value.questions).slice(0, 12).filter((item) => typeof item === "string").map((item) => safeText(item, 1000)),
  };
}

function readProfile(value) {
  if (!value || typeof value !== "object") throw new Error("profile");
  const profile = { ...INITIAL_PROFILE };
  for (const key of Object.keys(INITIAL_PROFILE)) profile[key] = safeText(value[key], key === "challenge" ? 4000 : 160) || INITIAL_PROFILE[key];
  if (!INDUSTRIES[profile.industry] || !GOALS[profile.goal] || !CITIES.includes(profile.city)) throw new Error("profile");
  if (!["ru", "kk"].includes(profile.locale)) profile.locale = "ru";
  return profile;
}

export default function BusinessWorkspace({ api, onCreateTask, onCatalog }) {
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [pilot, setPilot] = useState(DEFAULT_PILOT);
  const [diagnostic, setDiagnostic] = useState(null);
  const [resultProfile, setResultProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [templates, setTemplates] = useState([]);
  const [templateError, setTemplateError] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateRetry, setTemplateRetry] = useState(0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const sectionRef = useRef(null);
  const resultRef = useRef(null);
  const effect = useMemo(() => calculateImpact(assumptions), [assumptions]);
  const exampleEffect = useMemo(() => calculateImpact(DEFAULT_ASSUMPTIONS), []);
  const assumptionsValid = Object.keys(INPUT_LIMITS).every((key) => assumptions[key] !== "" && Number.isFinite(Number(assumptions[key])) && Number(assumptions[key]) >= 0 && Number(assumptions[key]) <= INPUT_LIMITS[key]);
  const filteredTemplates = templates.filter((template) => (filter === "all" || template.industry === filter) && `${template.title} ${template.description} ${template.problem} ${INDUSTRIES[template.industry] || ""}`.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")));

  useEffect(() => {
    let active = true;
    setTemplatesLoading(true);
    setTemplateError("");
    api("/api/business/templates").then((data) => {
      if (active) setTemplates(safeList(data.templates));
    }).catch((err) => { if (active) setTemplateError(err.message || "Не удалось загрузить решения."); })
      .finally(() => { if (active) setTemplatesLoading(false); });
    return () => { active = false; };
  }, [api, templateRetry]);

  function navigate(nextTab) {
    setTab(nextTab);
    setNotice("");
    requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function updateProfile(key, value) { setProfile((previous) => ({ ...previous, [key]: value })); setError(""); }
  function updateAssumption(key, value) { setAssumptions((previous) => ({ ...previous, [key]: value })); }

  function applyTemplate(template) {
    setProfile((previous) => ({ ...previous, industry: template.industry, challenge: template.problem || template.description || "" }));
    setDiagnostic(null);
    setResultProfile(null);
    setError("");
    navigate("diagnose");
    setNotice(`Сценарий «${template.title}» добавлен. Уточните его под свой бизнес.`);
  }

  function applyDemo() {
    setProfile({ ...INITIAL_PROFILE, business_name: "Демо: кофейня в Таразе", challenge: "У нас небольшая кофейня в Таразе. Заказы записываем вручную, не отслеживаем повторные визиты. Хотим возвращать гостей и тратить меньше времени на учёт. Данные о продажах можно выгрузить из кассы. Нужно понять, с чего начать и как проверить эффект." });
    setDiagnostic(null);
    setResultProfile(null);
    setError("");
    navigate("diagnose");
    setNotice("Загружен демонстрационный пример. Все сведения в нём условные — замените их своими.");
  }

  async function diagnose(event) {
    event.preventDefault();
    if (busy) return;
    if (profile.business_name.trim().length < 2 || profile.challenge.trim().length < 20) {
      setError("Укажите название бизнеса (от 2 символов) и опишите ситуацию подробнее (от 20 символов).");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const submitted = { ...profile, business_name: profile.business_name.trim(), challenge: profile.challenge.trim() };
    try {
      const data = await api("/api/business/diagnose", { method: "POST", body: submitted });
      setDiagnostic(readDiagnostic(data));
      setResultProfile(submitted);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) { setError(err.message || "Не удалось выполнить анализ. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }

  function saveWorkspace() {
    if (!assumptionsValid) { setNotice("Проверьте значения калькулятора перед сохранением: нужны неотрицательные числа в указанных пределах."); return; }
    try {
      const timestamp = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, saved_at: timestamp, profile, assumptions, pilot, diagnostic, result_profile: resultProfile }));
      setSavedAt(timestamp);
      setNotice("Сохранено в этом браузере. На другом устройстве данные не появятся.");
    } catch { setNotice("Браузер не разрешил сохранение. Скачайте JSON-отчёт, чтобы сохранить данные."); }
  }

  function restoreWorkspace() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setNotice("В этом браузере пока нет сохранённого проекта."); return; }
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !saved.profile || !saved.assumptions) throw new Error("format");
      const restoredProfile = readProfile(saved.profile);
      const restoredAssumptions = {};
      for (const key of Object.keys(INPUT_LIMITS)) {
        const rawValue = saved.assumptions[key];
        if ((typeof rawValue !== "number" && typeof rawValue !== "string") || rawValue === "") throw new Error("number");
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value < 0 || value > INPUT_LIMITS[key]) throw new Error("number");
        restoredAssumptions[key] = value;
      }
      const restoredPilot = { ...DEFAULT_PILOT };
      for (const key of Object.keys(DEFAULT_PILOT)) {
        if (typeof saved.pilot?.[key] === "string") restoredPilot[key] = saved.pilot[key].slice(0, 160);
      }
      if (!["higher", "lower"].includes(restoredPilot.direction)) throw new Error("direction");
      restoredPilot.unit = restoredPilot.unit.slice(0, 30);
      for (const key of ["baseline", "target", "actual"]) {
        if (restoredPilot[key] !== "" && (!Number.isFinite(Number(restoredPilot[key])) || Number(restoredPilot[key]) < 0 || Number(restoredPilot[key]) > 1e12)) throw new Error("pilot");
      }
      const restoredDiagnostic = saved.diagnostic == null ? null : readDiagnostic(saved.diagnostic);
      const restoredResultProfile = restoredDiagnostic ? readProfile(saved.result_profile) : null;
      setProfile(restoredProfile);
      setAssumptions(restoredAssumptions);
      setPilot(restoredPilot);
      setDiagnostic(restoredDiagnostic);
      setResultProfile(restoredResultProfile);
      setSavedAt(typeof saved.saved_at === "string" ? saved.saved_at : null);
      setError("");
      setNotice("Сохранённый проект восстановлен из этого браузера.");
    } catch { setNotice("Не удалось прочитать сохранение: формат повреждён или устарел. Текущие данные сохранены на экране."); }
  }

  function exportReport() {
    if (!assumptionsValid) { setNotice("Исправьте значения калькулятора перед экспортом."); return; }
    try {
      const report = { title: "SaNa Business · отчёт по пилоту", version: 1, exported_at: new Date().toISOString(), profile, diagnostic, diagnostic_profile: resultProfile, forecast: { assumptions, result: effect, disclaimer: "Сценарий по введённым предположениям. Не гарантия результата. Стоимость освобождённого времени не включена в денежный эффект." }, pilot, storage: "Только этот браузер при явном сохранении" };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sana-business-report-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("JSON-отчёт подготовлен к скачиванию.");
    } catch { setNotice("Не удалось создать файл. Попробуйте сохранить проект в браузере."); }
  }

  const { ready: pilotReady, baseline, target, actual, improvement: pilotImprovement, targetReached, error: pilotError } = comparePilot(pilot);

  return <main className="business-hub">
    <div className="bh-location-line"><span><span className="bh-live-dot" /> Жамбыл облысы · Тараз</span><span>Жергілікті бизнес. Жаңа мүмкіндіктер.</span></div>
    <div className="bh-workspace-tabs" ref={sectionRef}>
      <nav aria-label="Разделы бизнес-помощника">{[["overview", "Обзор"], ["diagnose", "AI-диагностика"], ["sales", "Анализ продаж"], ["calculator", "Калькулятор эффекта"], ["solutions", "Готовые решения"]].map(([id, label]) => <button key={id} type="button" className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => navigate(id)}>{label}</button>)}</nav>
      <span className="bh-workspace-label"><span className="bh-small-grid">✦</span> Бизнес-помощник</span>
    </div>

    {notice && <div className="bh-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Закрыть уведомление">×</button></div>}

    {tab === "overview" && <div className="bh-view bh-overview">
      <section className="bh-hero">
        <div className="bh-hero-copy"><div className="bh-track-label"><span /> AI FOR SME & LOCAL BUSINESS</div><h1>Меньше рутины.<br />Больше <em>бизнеса.</em></h1><p className="bh-hero-description">Превратите ежедневные задачи в точки роста. SaNa помогает бизнесу Тараза и Жамбылской области найти применение AI, оценить эффект и запустить первый пилот.</p><div className="bh-hero-actions"><button className="bh-button bh-button-dark" onClick={() => navigate("diagnose")}>Найти точки роста <Glyph name="northeast" /></button><button className="bh-text-button" onClick={applyDemo}>Посмотреть пример <Glyph /></button></div><div className="bh-hero-footnote"><Glyph name="shield" /><span>Ваш контекст → понятный план → измеримый результат</span></div></div>
        <div className="bh-hero-visual"><div className="bh-orbit bh-orbit-one" /><div className="bh-orbit bh-orbit-two" /><div className="bh-visual-spark" aria-hidden="true">✳</div><div className="bh-demo-card"><div className="bh-demo-heading"><div className="bh-demo-icon"><Glyph name="coffee" /></div><div><strong>Кофейня в Таразе</strong><span>Пример бизнес-сценария</span></div><span className="bh-demo-badge">ДЕМО</span></div><div className="bh-demo-brief"><span className="bh-demo-kicker">ВОЗМОЖНОСТЬ ДЛЯ РОСТА</span><h2>Возвращать гостей.<br />Считать результат.</h2><p>Повторные визиты + учёт закупок</p></div><div className="bh-demo-result"><span>Расчётный денежный эффект / мес.</span><strong>+{money(exampleEffect.cashMonthly)}</strong><div className="bh-demo-bars" aria-label="Демонстрационный расчёт: прибыль от роста продаж 52 500 тенге, экономия 48 000 тенге, расходы на сервис 15 000 тенге"><span style={{ width: `${exampleEffect.additionalGrossProfit / (exampleEffect.additionalGrossProfit + exampleEffect.cashSavings) * 100}%` }} /><span style={{ flex: 1 }} /></div><div className="bh-demo-legend"><span><i /> Рост прибыли</span><span><i /> Экономия расходов</span></div></div><div className="bh-demo-footer"><Glyph name="clock" /><span>Ещё <strong>{decimal(exampleEffect.hoursSaved)} ч</strong> для команды в месяц</span><Glyph name="northeast" /></div></div><div className="bh-demo-disclaimer">Условные исходные данные. Это сценарий, а не обещание дохода.</div></div>
      </section>

      <section className="bh-outcomes" aria-label="Цели бизнеса">{[["01", "chart", "Больше выручки", "Повторные продажи, быстрые ответы и работа с клиентами."], ["02", "bag", "Меньше расходов", "Контроль остатков, закупок и потерь на понятных данных."], ["03", "clock", "Время для главного", "Меньше ручного учёта и повторяющихся действий."]].map(([number, icon, title, description]) => <article key={number}><span className="bh-outcome-number">{number}</span><Glyph name={icon} /><h3>{title}</h3><p>{description}</p></article>)}</section>

      <section className="bh-roadmap-section"><SectionHeading number="01" eyebrow="ОТ ЗАДАЧИ ДО ЭФФЕКТА" title="Начните с одной задачи.">AI полезен, когда решает конкретную проблему. Пройдите путь от идеи до проверки на цифрах.</SectionHeading><div className="bh-roadmap">{[["01", "Расскажите о бизнесе", "Опишите процесс, который отнимает время или деньги.", "diagnose"], ["02", "Проверьте данные продаж", "Загрузите CSV: узнайте, что приносит выручку и валовую прибыль.", "sales"], ["03", "Проверьте экономику", "Оцените затраты и зафиксируйте результат после пилота.", "calculator"]].map(([number, title, description, destination]) => <button className="bh-roadmap-step" key={number} onClick={() => navigate(destination)}><span>{number}<Glyph name="northeast" /></span><h3>{title}</h3><p>{description}</p></button>)}</div></section>

      <section className="bh-sector-section"><div><span className="bh-eyebrow">РЕШЕНИЯ РЯДОМ</span><h2>Для бизнеса,<br />который вы знаете.</h2><p>Кофейня у дома, магазин на районе или семейная мастерская — начните со знакомого сценария.</p><button className="bh-text-button" onClick={() => navigate("solutions")}>Все решения <Glyph /></button></div><div className="bh-sector-grid">{Object.entries(INDUSTRIES).map(([id, title]) => <button key={id} onClick={() => { setFilter(id); navigate("solutions"); }}><Glyph name={INDUSTRY_ICONS[id]} /><span>{title}</span><Glyph name="northeast" /></button>)}</div></section>
      <section className="bh-bottom-cta"><div><span className="bh-eyebrow">ИДЕЯ СТАНОВИТСЯ ЗАДАЧЕЙ</span><h2>Нужна команда для внедрения?</h2><p>Соберите понятный бриф, проверьте его и опубликуйте задачу. Решение о выборе команды остаётся за вами.</p></div><button className="bh-button bh-button-lime" onClick={onCatalog}>Открыть каталог задач <Glyph name="northeast" /></button></section>
    </div>}

    {tab === "diagnose" && <div className="bh-view bh-diagnose-view"><SectionHeading number="01" eyebrow="AI-ДИАГНОСТИКА" title="Где ваш бизнес теряет возможности?">Расскажите, как всё устроено сейчас. Получите гипотезы для проверки и план первого пилота.</SectionHeading><div className="bh-diagnose-layout"><form className="bh-diagnostic-form" onSubmit={diagnose}><div className="bh-form-title"><span className="bh-step-chip">1</span><div><h3>Контекст вашего бизнеса</h3><p>Чем конкретнее описание, тем полезнее рекомендации.</p></div></div><div className="bh-form-grid"><label className="bh-field"><span>Название бизнеса <span aria-hidden="true">*</span></span><input required minLength={2} maxLength={160} placeholder="Например, кофейня «Таң»" value={profile.business_name} onChange={(e) => updateProfile("business_name", e.target.value)} autoComplete="organization" /></label><label className="bh-field"><span>Город или район</span><select value={profile.city} onChange={(e) => updateProfile("city", e.target.value)}>{CITIES.map((city) => <option key={city}>{city}</option>)}</select></label><label className="bh-field"><span>Сфера бизнеса</span><select value={profile.industry} onChange={(e) => updateProfile("industry", e.target.value)}>{Object.entries(INDUSTRIES).map(([id, title]) => <option value={id} key={id}>{title}</option>)}</select></label><label className="bh-field"><span>Главная цель</span><select value={profile.goal} onChange={(e) => updateProfile("goal", e.target.value)}>{Object.entries(GOALS).map(([id, title]) => <option value={id} key={id}>{title}</option>)}</select></label><label className="bh-field"><span>Язык плана</span><select value={profile.locale} onChange={(e) => updateProfile("locale", e.target.value)}><option value="ru">Русский</option><option value="kk">Қазақша</option></select></label></div><label className="bh-field bh-challenge"><span>Что хотите изменить? <span aria-hidden="true">*</span></span><textarea required minLength={20} maxLength={4000} rows={6} value={profile.challenge} onChange={(e) => updateProfile("challenge", e.target.value)} placeholder="Что делаете вручную? Где теряются клиенты, деньги или время? Какие данные уже есть?" /><small>{profile.challenge.length} / 4000 · Минимум 20 символов. Не указывайте пароли и персональные данные клиентов.</small></label>{error && <div className="bh-error" role="alert">{error}</div>}<div className="bh-form-actions"><button className="bh-button bh-button-dark" type="submit" disabled={busy}>{busy ? "Анализируем ваш сценарий…" : "Получить план действий"}<Glyph name={busy ? "refresh" : "spark"} className={busy ? "bh-spinning" : ""} /></button><button className="bh-text-button" type="button" onClick={applyDemo} disabled={busy}>Заполнить пример</button></div><p className="bh-form-note">Анализ формирует рекомендации, а не подтверждённые факты о бизнесе. Источник результата будет указан явно.</p></form><aside className="bh-diagnostic-aside"><span className="bh-large-asterisk" aria-hidden="true">✳</span><span className="bh-eyebrow">НА ВЫХОДЕ — ЯСНОСТЬ</span><h3>Не ещё одна идея.<br />Следующий шаг.</h3><ul><li><Glyph name="check" /> Возможности для вашего бизнеса</li><li><Glyph name="check" /> Метрики для проверки гипотез</li><li><Glyph name="check" /> План пилота на 4 недели</li><li><Glyph name="check" /> Черновик задачи для команды</li></ul><div className="bh-aside-bottom"><Glyph name="shield" /><p>Если AI недоступен, сработают правила по отрасли. Вы увидите, какой режим использован.</p></div></aside></div>
      {diagnostic && <section className="bh-diagnostic-result" ref={resultRef} aria-live="polite"><div className="bh-result-topline"><span className="bh-eyebrow">ВАШ ПЛАН ДЕЙСТВИЙ</span><SourceTag source={diagnostic.source} /></div><h2>{resultProfile?.business_name || "Ваш бизнес"}: с чего начать</h2><p className="bh-result-summary">{diagnostic.summary}</p><div className="bh-result-context"><span><Glyph name="pin" />{resultProfile?.city}</span><span>{INDUSTRIES[resultProfile?.industry]}</span><span>{GOALS[resultProfile?.goal]}</span></div><div className="bh-opportunity-grid">{safeList(diagnostic.opportunities).map((opportunity, index) => <article className="bh-opportunity" key={index}><span className="bh-opportunity-index">{String(index + 1).padStart(2, "0")}</span><h3>{typeof opportunity === "string" ? opportunity : opportunity.title}</h3>{typeof opportunity === "object" && <><p>{opportunity.description || opportunity.benefit}</p>{(opportunity.kpi || opportunity.metric) && <div className="bh-metric"><Glyph name="chart" /><span>{textOf(opportunity.kpi || opportunity.metric)}</span></div>}{opportunity.first_step && <p><strong>Первый шаг:</strong> {opportunity.first_step}</p>}</>}</article>)}</div><div className="bh-plan-heading"><h3>Четыре недели до проверки гипотезы</h3><span>Рекомендуемый план пилота</span></div><ol className="bh-week-plan">{safeList(diagnostic.plan || diagnostic.four_week_plan).map((week, index) => <li key={index}><span className="bh-week-number">{String(index + 1).padStart(2, "0")}</span><div><small>НЕДЕЛЯ {index + 1}</small><h4>{typeof week === "string" ? week : week.title || week.focus}</h4>{safeList(week.actions || week.tasks).map((action, actionIndex) => <p key={actionIndex}>{textOf(action)}</p>)}{week.description && <p>{week.description}</p>}</div></li>)}</ol>{safeList(diagnostic.questions).length > 0 && <div className="bh-questions"><h3>Что стоит уточнить перед запуском</h3><ol>{diagnostic.questions.map((question, index) => <li key={index}>{textOf(question)}</li>)}</ol></div>}<div className="bh-result-action"><div><h3>Переходим к проверке?</h3><p>Рассчитайте сценарий или передайте черновик в конструктор задачи. Публикация — после вашего подтверждения.</p></div><div><button className="bh-button bh-button-dark" disabled={!diagnostic.task_draft} onClick={() => onCreateTask(diagnostic.task_draft, resultProfile?.industry || profile.industry)}>Подготовить задачу <Glyph /></button><button className="bh-text-button" onClick={() => navigate("calculator")}>Посчитать эффект <Glyph name="chart" /></button></div></div><p className="bh-result-note">{diagnostic.source === "openai" ? "AI выбрал порядок рекомендаций из отраслевых сценариев по вашему описанию. Проверьте их перед внедрением." : "Это рекомендации по отраслевым правилам. AI-модель не участвовала в анализе."} Численные результаты проверяются только на данных пилота.</p></section>}
    </div>}

    {tab === "calculator" && <div className="bh-view bh-calculator-view"><SectionHeading number="02" eyebrow="ЭКОНОМИКА ПИЛОТА" title="Сначала посчитайте. Потом внедряйте.">Измените исходные данные и проверьте сценарий. Освобождённое время учитывается отдельно от денег.</SectionHeading><div className="bh-assumption-banner"><Glyph name="chart" /><p><strong>Стартовые значения — демонстрационные.</strong> Замените их цифрами своего бизнеса. Прогноз — гипотеза для пилота, а не гарантия дохода.</p><button type="button" className="bh-text-button" onClick={() => { setAssumptions(DEFAULT_ASSUMPTIONS); setNotice("Восстановлены демонстрационные исходные данные калькулятора."); }}>Сбросить пример <Glyph name="refresh" /></button></div><div className="bh-calculator-layout"><div className="bh-calculator-inputs"><div className="bh-calc-input-group"><h3><span>01</span> Как бизнес работает сейчас</h3><div className="bh-form-grid"><NumericField label="Выручка в месяц" suffix="₸" value={assumptions.monthly_revenue} max={INPUT_LIMITS.monthly_revenue} onChange={(v) => updateAssumption("monthly_revenue", v)} /><NumericField label="Расходы для оптимизации / мес." suffix="₸" value={assumptions.monthly_costs} max={INPUT_LIMITS.monthly_costs} hint="Отдельная база расходов, которую планируете сократить" onChange={(v) => updateAssumption("monthly_costs", v)} /><NumericField label="Валовая маржа" suffix="%" value={assumptions.gross_margin_pct} max={100} onChange={(v) => updateAssumption("gross_margin_pct", v)} hint="Доля валовой прибыли в выручке" /><NumericField label="Рутина команды в неделю" suffix="ч" value={assumptions.hours_per_week} max={168} onChange={(v) => updateAssumption("hours_per_week", v)} /><NumericField label="Стоимость часа работы" suffix="₸" value={assumptions.hourly_cost} max={INPUT_LIMITS.hourly_cost} onChange={(v) => updateAssumption("hourly_cost", v)} hint="Для оценки времени; не входит в денежный эффект" /></div></div><div className="bh-calc-input-group"><h3><span>02</span> Гипотеза после внедрения</h3>{[["revenue_growth_pct", "Рост выручки"], ["cost_reduction_pct", "Сокращение выбранных расходов"], ["automation_pct", "Доля автоматизированной рутины"]].map(([key, label]) => <label className="bh-slider-field" key={key}><span>{label}<strong>{assumptions[key]}%</strong></span><input type="range" min="0" max="100" step="1" value={assumptions[key]} onChange={(e) => updateAssumption(key, e.target.value)} style={{ "--bh-range": `${assumptions[key]}%` }} /><small><span>0%</span><span>100%</span></small></label>)}</div><div className="bh-calc-input-group"><h3><span>03</span> Стоимость внедрения</h3><div className="bh-form-grid"><NumericField label="Разовые затраты на запуск" suffix="₸" value={assumptions.setup_cost} max={INPUT_LIMITS.setup_cost} onChange={(v) => updateAssumption("setup_cost", v)} /><NumericField label="Инструменты и поддержка / мес." suffix="₸" value={assumptions.monthly_tool_cost} max={INPUT_LIMITS.monthly_tool_cost} onChange={(v) => updateAssumption("monthly_tool_cost", v)} /></div></div>{!assumptionsValid && <p className="bh-error" role="alert">Введите неотрицательные числа: проценты до 100, часы до 168. Результат обновится после исправления.</p>}</div><aside className="bh-calculator-result" aria-live="polite"><span className="bh-eyebrow">ВАШ РАСЧЁТНЫЙ СЦЕНАРИЙ</span><p className="bh-total-label">Денежный эффект в месяц</p><div className={`bh-cash-total ${effect.cashMonthly < 0 ? "bh-negative" : ""}`}>{assumptionsValid ? `${effect.cashMonthly > 0 ? "+" : ""}${money(effect.cashMonthly)}` : "—"}</div><p className="bh-total-note">После ежемесячной стоимости инструментов</p><div className="bh-cash-breakdown"><div><span><i className="bh-dot-lime" /> Прибыль от роста выручки</span><strong>{assumptionsValid ? money(effect.additionalGrossProfit) : "—"}</strong></div><div><span><i className="bh-dot-mint" /> Экономия выбранных расходов</span><strong>{assumptionsValid ? money(effect.cashSavings) : "—"}</strong></div><div><span><i className="bh-dot-gray" /> Инструменты и поддержка</span><strong>−{assumptionsValid ? money(effect.monthlyToolCost) : "—"}</strong></div></div><div className="bh-calc-mini-grid"><div><span>Окупаемость запуска</span><strong>{!assumptionsValid ? "—" : effect.paybackMonths === null ? "Не достигается" : effect.paybackMonths === 0 ? "Без затрат на запуск" : `${decimal(effect.paybackMonths)} мес.`}</strong></div><div><span>За год, за вычетом запуска</span><strong>{assumptionsValid ? money(effect.cashYearAfterSetup) : "—"}</strong></div></div><div className="bh-time-result"><Glyph name="clock" /><div><span>Свободная ёмкость команды</span><strong>{assumptionsValid ? decimal(effect.hoursSaved) : "—"} ч / месяц</strong><p>Условная стоимость: {assumptionsValid ? money(effect.timeValue) : "—"}. Это время для других задач, не денежная экономия.</p></div></div><details className="bh-formula"><summary>Как устроен расчёт</summary><p>Прибыль от роста = выручка × рост выручки × валовая маржа.</p><p>Экономия = выбранные расходы × доля сокращения.</p><p>Денежный эффект = дополнительная прибыль + экономия − инструменты.</p><p>Время = часы рутины в неделю × 52 / 12 × доля автоматизации. Стоимость этого времени не прибавляется к денежному эффекту.</p><p>Окупаемость = затраты на запуск / положительный месячный эффект. При нулевых затратах запуск не требует окупаемости. Не учитывайте одно сокращение затрат дважды в разных предположениях.</p></details></aside></div>
      <section className="bh-pilot-section"><SectionHeading number="03" eyebrow="ОТ ПРОГНОЗА К ФАКТУ" title="Пилот закончен. Что изменилось?">Запишите исходное значение, цель и фактический результат за одинаковый период. SaNa сравнит введённые вами числа.</SectionHeading><div className="bh-pilot-panel"><div className="bh-pilot-fields"><label className="bh-field"><span>Что измеряем</span><input value={pilot.metric} maxLength={160} onChange={(e) => setPilot({ ...pilot, metric: e.target.value })} /></label><label className="bh-field"><span>Единица измерения</span><input value={pilot.unit} maxLength={30} placeholder="₸, часы, заказы…" onChange={(e) => setPilot({ ...pilot, unit: e.target.value })} /></label><label className="bh-field"><span>Хороший результат</span><select value={pilot.direction} onChange={(e) => setPilot({ ...pilot, direction: e.target.value })}><option value="higher">Больше — лучше</option><option value="lower">Меньше — лучше</option></select></label></div><div className="bh-pilot-values">{[["baseline", "До пилота"], ["target", "Цель"], ["actual", "Факт после пилота"]].map(([key, label]) => <NumericField key={key} label={label} suffix={pilot.unit} value={pilot[key]} max={1e12} onChange={(value) => setPilot({ ...pilot, [key]: value })} />)}</div>{pilotError && <p className="bh-error" role="alert">{pilotError}</p>}{pilotReady ? <div className="bh-pilot-comparison"><div className="bh-pilot-bars" role="img" aria-label={`${pilot.metric}. До пилота: ${baseline}; цель: ${target}; факт: ${actual} ${pilot.unit}.`}>{[["До", baseline], ["Цель", target], ["Факт", actual]].map(([label, value], index) => <div key={label}><span>{label}</span><div><i style={{ width: `${value / Math.max(baseline, target, actual, 1) * 100}%` }} className={`bh-pilot-bar-${index}`} /></div><strong>{decimal(value)}</strong></div>)}</div><div className={`bh-pilot-verdict ${targetReached ? "is-positive" : ""}`}><Glyph name={targetReached ? "check" : "chart"} /><h3>{targetReached ? "Цель достигнута" : "Цель пока не достигнута"}</h3><p>Изменение к исходному значению: {actual - baseline > 0 ? "+" : ""}{decimal(actual - baseline)} {pilot.unit}.{baseline > 0 ? ` Это ${decimal((actual - baseline) / baseline * 100)}%.` : " Процент изменения не вычисляется при нулевой базе."}</p><small>{pilotImprovement > 0 ? "Показатель движется в выбранную сторону." : pilotImprovement < 0 ? "Показатель изменился в противоположную сторону." : "Показатель не изменился."} Причину изменения нужно проверить отдельно.</small></div></div> : <p className="bh-pilot-empty"><Glyph name="chart" />Фактических результатов пока нет. Введите все три значения, чтобы сравнить их.</p>}</div></section>
    </div>}

    {tab === "solutions" && <div className="bh-view bh-solutions-view"><SectionHeading number="04" eyebrow="БИБЛИОТЕКА СЦЕНАРИЕВ" title="Знакомая задача. Новый подход.">Выберите ситуацию из вашей отрасли. Используйте её как основу диагностики и адаптируйте под свой бизнес.</SectionHeading><div className="bh-solutions-toolbar"><label className="bh-search"><Glyph name="search" /><input type="search" placeholder="Найти задачу или решение" aria-label="Поиск готовых решений" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label className="bh-filter-select"><span className="bh-sr-only">Фильтр по отрасли</span><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Все отрасли</option>{Object.entries(INDUSTRIES).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label></div>{templatesLoading && <div className="bh-empty" role="status"><Glyph name="refresh" className="bh-spinning" /><p>Загружаем библиотеку решений…</p></div>}{templateError && <div className="bh-empty bh-error" role="alert"><p>{templateError}</p><button className="bh-button bh-button-dark" onClick={() => setTemplateRetry((value) => value + 1)}>Попробовать ещё раз <Glyph name="refresh" /></button></div>}{!templatesLoading && !templateError && <><p className="bh-results-count">Сценариев найдено: {filteredTemplates.length}</p><div className="bh-solution-grid">{filteredTemplates.map((template, index) => <article className="bh-solution-card" key={template.id}><div className="bh-solution-top"><span className="bh-solution-icon"><Glyph name={INDUSTRY_ICONS[template.industry]} /></span><span>{INDUSTRIES[template.industry]}</span><small>{String(index + 1).padStart(2, "0")}</small></div><h3>{template.title}</h3><p>{template.description}</p><div className="bh-solution-kpi"><Glyph name="chart" /><span><small>ЧТО ИЗМЕРЯЕМ</small>{textOf(template.kpi)}</span></div><details><summary>Как проверить идею</summary><ol>{safeList(template.steps).map((step, stepIndex) => <li key={stepIndex}>{textOf(step)}</li>)}</ol></details><button className="bh-solution-use" onClick={() => applyTemplate(template)}>Адаптировать под мой бизнес <Glyph name="northeast" /></button></article>)}</div>{filteredTemplates.length === 0 && <div className="bh-empty"><Glyph name="search" /><h3>Подходящий сценарий не найден</h3><p>Измените запрос или начните диагностику с описания своей задачи.</p><button className="bh-button bh-button-dark" onClick={() => navigate("diagnose")}>Описать свою задачу <Glyph /></button></div>}</>}<div className="bh-solution-note"><Glyph name="shield" /><p>Сценарии — отправная точка для пилота. Подключения к кассам, мессенджерам и CRM требуют отдельного внедрения и здесь не настроены.</p></div></div>}

    {tab === "sales" && <SalesAnalytics onCreateTask={onCreateTask} />}

    <footer className="bh-workspace-footer"><div><strong>SaNa<span> / Business</span></strong><p>{savedAt && !Number.isNaN(Date.parse(savedAt)) ? `Сохранено: ${new Date(savedAt).toLocaleString("ru-RU")}. ` : ""}Диагностика и калькулятор сохраняются только в этом браузере, по кнопке.</p></div><div className="bh-footer-actions"><button onClick={restoreWorkspace}><Glyph name="refresh" />Восстановить</button><button onClick={saveWorkspace}><Glyph name="save" />Сохранить</button><button onClick={exportReport}><Glyph name="download" />Скачать JSON</button></div></footer>
  </main>;
}
