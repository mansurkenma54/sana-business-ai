import { useEffect, useRef, useState } from "react";

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}

function TrophyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4a4 4 0 0 1-8 0V4Zm0 2H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4M12 12v5m-4 3h8m-6-3h4" /></svg>;
}

export function AuthScreen({ api, onLogin, Mascot }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "business" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onLogin(await api(`/api/auth/${register ? "register" : "login"}`, { method: "POST", body: form })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="page-shell auth-layout"><section className="auth-story"><span className="eyebrow">ИДЕЯ → ОПЫТ → РЕЗУЛЬТАТ</span><h1>Настоящие задачи.<br/><em>Настоящая практика.</em></h1><p>Бизнес объясняет задачу. Sana помогает уточнить её. Команды предлагают решения — а решения всегда принимает человек.</p><Mascot mood={busy ? "thinking" : "happy"}/><ol><li>Уточните задачу и повысьте её рейтинг</li><li>Найдите команду или полезную практику</li><li>Работайте вместе до принятого результата</li></ol></section><form className="account-card auth-form" onSubmit={submit}><span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В SANA</span><h2>{register ? "Создать аккаунт" : "С возвращением"}</h2><p>Ваши задачи и команда останутся с вами на любом устройстве.</p>{register && <><div className="account-role"><button type="button" className={form.role === "business" ? "selected" : ""} onClick={()=>setForm({...form,role:"business"})}>Я — бизнес<small>Создать задачу</small></button><button type="button" className={form.role === "student" ? "selected" : ""} onClick={()=>setForm({...form,role:"student"})}>Я — студент<small>Найти практику</small></button></div><label>Ваше имя<input required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label></>}<label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Пароль<input required type="password" minLength={10} maxLength={128} autoComplete={register ? "new-password" : "current-password"} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><small>Не менее 10 символов</small></label>{error && <p className="account-error" role="alert">{error}</p>}<button disabled={busy} className="primary-button">{busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти"}</button><button type="button" className="outline-button" onClick={()=>{setRegister(!register);setError("");}}>{register ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать"}</button></form></main>;
}

export function AccountProfile({ user, teams, api, refresh, selectedTeam, selectTeam, notify, logout, progressBoard = [], ownedTaskCount = 0 }) {
  const [profile, setProfile] = useState(user);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action) { setBusy(true); try { await action(); await refresh(); } catch(e) { notify(e.message, true); } finally { setBusy(false); } }
  const ranked = new Map(progressBoard.map((team, index) => [team.id, { points: team.progress_points || 0, rank: index + 1 }]));
  const totalPoints = teams.reduce((sum, team) => sum + (ranked.get(team.id)?.points || 0), 0);
  const memberCount = new Set(teams.flatMap(team => team.members.map(member => member.id))).size;
  const completionFields = user.role === "business" ? [profile.name, profile.company, profile.about] : [profile.name, profile.about];
  const completion = Math.round((completionFields.filter(value => String(value || "").trim()).length / completionFields.length) * 100);
  const stats = user.role === "student"
    ? [[totalPoints, "подтверждённых баллов"], [teams.length, "команд"], [memberCount, "участников рядом"]]
    : [[ownedTaskCount, "ваших задач"], [`${completion}%`, "профиль заполнен"], ["AI", "помогает с задачами"]];

  return <main className="page-shell profile-dashboard">
    <header className="profile-hero">
      <div className="profile-identity"><span className="profile-avatar-large">{user.name.slice(0,1).toUpperCase()}</span><div><span className="eyebrow">{user.role === "student" ? "ПРОФИЛЬ СТУДЕНТА" : "ПРОФИЛЬ БИЗНЕСА"}</span><h1>{user.name}</h1><p>{user.email} · {user.role === "student" ? "участник проектных команд" : profile.company || "укажите компанию"}</p></div></div>
      <div className="profile-hero-actions"><span className="profile-security">● Данные защищены</span><button className="profile-logout" onClick={logout}>Выйти</button></div>
      <div className="profile-stat-grid">{stats.map(([value,label])=><article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
    </header>

    <div className="profile-content-grid">
      <form className="account-card profile-details-card" onSubmit={e=>{e.preventDefault();run(async()=>{await api("/api/account/profile",{method:"PUT",body:profile});notify("Профиль сохранён");});}}>
        <div className="section-heading"><div><span className="eyebrow">ЛИЧНЫЕ ДАННЫЕ</span><h2>Основная информация</h2></div><span className="completion-chip">{completion}% заполнено</span></div>
        <div className="profile-completion"><i style={{width:`${completion}%`}} /></div>
        <label>Имя<input required maxLength={80} value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
        <label>Email<input value={user.email} readOnly aria-describedby="email-note"/><small id="email-note">Email аккаунта нельзя изменить</small></label>
        {user.role === "business" && <label>Компания<input maxLength={120} value={profile.company || ""} onChange={e=>setProfile({...profile,company:e.target.value})} placeholder="Название компании"/></label>}
        <label>О себе<textarea maxLength={500} value={profile.about || ""} onChange={e=>setProfile({...profile,about:e.target.value})} placeholder={user.role === "student" ? "Навыки, интересы и желаемые проекты" : "Коротко о компании и её направлении"}/><small>{(profile.about || "").length}/500</small></label>
        <div className="profile-save-row"><button disabled={busy} className="primary-button">{busy ? "Сохраняем…" : "Сохранить изменения"}</button><span>Роль: {user.role === "business" ? "бизнес" : "студент"}</span></div>
      </form>

      {user.role === "student" ? <section className="account-card team-action-card">
        <span className="eyebrow">КОМАНДА</span><h2>Создать или вступить</h2><p>Работайте самостоятельно или объединитесь с друзьями.</p>
        <form onSubmit={e=>{e.preventDefault();run(async()=>{const r=await api("/api/teams",{method:"POST",body:{name}}); await api(`/api/account/teams/${r.team.id}/invite`,{method:"POST",body:{}});selectTeam(r.team.id);setName("");notify("Команда создана");});}}><label>Название команды<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, Sana Makers"/></label><button disabled={busy} className="primary-button">Создать команду</button></form>
        <div className="account-divider"><span>или по приглашению</span></div>
        <form className="join-form" onSubmit={e=>{e.preventDefault();run(async()=>{const r=await api("/api/account/join",{method:"POST",body:{code}});selectTeam(r.team_id);setCode("");notify("Вы в команде");});}}><label>Шестизначный код<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="000000"/></label><button disabled={busy} className="outline-button">Вступить</button></form>
      </section> : <section className="account-card profile-guide-card"><span className="profile-guide-icon">✦</span><span className="eyebrow">SANA ПОДСКАЖЕТ</span><h2>Сильная задача начинается с контекста</h2><p>Опишите проблему своими словами. AI задаст уточняющие вопросы, соберёт карточку и покажет, какие сведения повысят рейтинг.</p></section>}
    </div>

    {user.role === "student" && <section className="teams-overview"><div className="section-heading"><div><span className="eyebrow">МОИ КОМАНДЫ</span><h2>Команды и заработанные баллы</h2></div><span>{teams.length ? `${teams.length} ${teams.length === 1 ? "команда" : "команды"}` : "Пока нет команд"}</span></div>
      {!teams.length && <div className="profile-empty"><TrophyIcon/><h3>Первая команда — первый шаг</h3><p>Создайте команду выше или введите код приглашения.</p></div>}
      <div className="team-profile-list">{teams.map(team=>{const standing=ranked.get(team.id) || {points:0,rank:"—"}; return <article className={`account-card team-section ${team.id === selectedTeam ? "active-team" : ""}`} key={team.id}>
        <header><div><span className="eyebrow">{team.id === selectedTeam ? "АКТИВНАЯ КОМАНДА" : `МЕСТО В РЕЙТИНГЕ · ${standing.rank}`}</span><h2>{team.name}</h2></div><div className="team-points"><TrophyIcon/><strong>{standing.points}</strong><span>баллов</span></div></header>
        <div className="member-grid">{team.members.map(member=><article key={member.id}><span className="member-avatar">{member.name.slice(0,1).toUpperCase()}</span><div><h3>{member.name}</h3><small>{member.captain ? "Капитан" : "Участник"}</small></div></article>)}</div>
        <div className="team-card-footer"><div className="invite-code"><span>Код приглашения · 7 дней</span><strong>{team.code || "Не создан"}</strong></div><div>{team.id !== selectedTeam && <button className="outline-button" onClick={()=>{selectTeam(team.id);notify("Команда выбрана");}}>Сделать активной</button>}{team.members.some(m=>m.id===user.id && m.captain) && <button disabled={busy} className="ghost-button" onClick={()=>run(()=>api(`/api/account/teams/${team.id}/invite`,{method:"POST",body:{}}))}>Обновить код</button>}</div></div>
      </article>})}</div>
    </section>}
  </main>;
}

export function Notifications({ api, onNavigate, notify }) {
  const [items, setItems] = useState([]), [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  async function load() { try { setItems((await api("/api/notifications")).notifications); } catch { /* Session expiry is handled by the next user action. */ } }
  useEffect(()=>{const close=(event)=>{if(open&&!wrapRef.current?.contains(event.target))setOpen(false);};const escape=(event)=>{if(event.key==="Escape")setOpen(false);};document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};},[open]);
  useEffect(()=>{load();const id=setInterval(load,15000);return()=>clearInterval(id);},[]);
  const unread = items.filter(item=>!item.read).length;
  async function markAll() { try { await api("/api/notifications/read",{method:"POST",body:{ids:items.map(item=>item.id)}}); await load(); } catch(e) { notify(e.message,true); } }
  return <div className="notification-wrap" ref={wrapRef}><button className="notification-trigger" aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`} aria-expanded={open} onClick={()=>{setOpen(value=>!value);load();}}><BellIcon/><span>Уведомления</span>{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}</button>{open && <section className="notification-menu" aria-label="Уведомления"><header><div><span className="eyebrow">СОБЫТИЯ</span><h3>Уведомления</h3></div>{unread > 0 && <button onClick={markAll}>Прочитать все</button>}</header>{!items.length && <div className="notification-empty"><BellIcon/><strong>Пока всё спокойно</strong><p>Здесь появятся предложения и результаты проверки.</p></div>}{items.slice(0,30).map(item=><button className={item.read ? "read" : "unread"} key={item.id} onClick={async()=>{try{await api("/api/notifications/read",{method:"POST",body:{ids:[item.id]}});setOpen(false);onNavigate(item.view);load();}catch(e){notify(e.message,true);}}}><i /> <span>{item.text}<small>Открыть раздел →</small></span></button>)}</section>}</div>;
}

export function Delivery({ user, api, notify, fields, Mascot }) {
  const [items, setItems] = useState([]), [selected, setSelected] = useState("");
  const [form, setForm] = useState({result:"",link:"",comment:""}), [question, setQuestion] = useState(""), [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { const r=await api("/api/workspaces");setItems(r.workspaces); }
  useEffect(()=>{load().catch(e=>notify(e.message,true));},[]);
  const item=items.find(i=>i.proposal.id===selected) || items[0];
  async function action(path, body) {setBusy(true);try{await api(`/api/workspaces/${item.proposal.id}/${path}`,{method:"POST",body});await load();if(path==="submit")setForm({result:"",link:"",comment:""});if(path==="coach")setQuestion("");if(path==="review")setFeedback("");notify("Сохранено");}catch(e){notify(e.message,true);}finally{setBusy(false);}}
  const latest=item?.history.at(-1);
  const latestCoachSource=[...(item?.messages || [])].reverse().find(message=>message.role==="assistant")?.source;
  return <main className="page-shell"><header className="page-hero"><div><span className="eyebrow">ОТ ПЛАНА К РЕЗУЛЬТАТУ</span><h1>Рабочее пространство</h1><p>Команда делает. Sana направляет. Бизнес проверяет лично.</p></div><button className="outline-button" onClick={()=>load().catch(e=>notify(e.message,true))}>Обновить</button></header>{!items.length ? <section className="account-card"><h2>Сначала — выбор команды</h2><p>После принятия предложения здесь появятся карточка, помощник и отправка решения. Откройте «Мои задачи» или «Мои отклики».</p></section> : <><label className="workspace-picker">Выберите задачу<select value={item.proposal.id} onChange={e=>{setSelected(e.target.value);setForm({result:"",link:"",comment:""});setFeedback("");setQuestion("");}}>{items.map(i=><option key={i.proposal.id} value={i.proposal.id}>{i.task.title} · {i.team?.name || i.proposal.team_id}</option>)}</select></label><div className="delivery-grid"><section className="account-card"><span className="eyebrow">СОГЛАСОВАННАЯ ЗАДАЧА</span><h2>{item.task.title}</h2><dl className="delivery-card">{fields.filter(([key])=>key!=="title").map(([key,label])=><div key={key}><dt>{label}</dt><dd>{item.task[key] || "Не указано — уточните у бизнеса"}</dd></div>)}</dl></section><section className="account-card coach-card"><header><Mascot mood={busy?"thinking":"happy"}/><div><h2>Sana рядом</h2><p>AI-наставник, а не исполнитель</p></div></header><p className="account-note">Помощник использует ChatGPT и факты карточки. При недоступности модели автоматически включается безопасный резервный режим.{latestCoachSource === "fallback" ? " Последний ответ получен в резервном режиме." : ""}</p><div className="coach-messages" aria-live="polite">{item.messages.length ? item.messages.map((m,i)=><div className={`coach-message ${m.role}`} key={i}>{m.text}</div>) : <p>Спросите, с чего начать или что уточнить перед работой.</p>}</div><form onSubmit={e=>{e.preventDefault();action("coach",{question});}}><label>Вопрос Sana<textarea required maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)}/></label><button disabled={busy} className="primary-button">{busy ? "Sana думает…" : "Получить подсказку"}</button></form></section></div><section className="account-card solution-section"><span className="eyebrow">ПРОВЕРКА ЧЕЛОВЕКОМ</span><h2>{latest?.status === "accepted" ? "Работа принята — всё получилось!" : "Результат и история версий"}</h2>{!item.history.length && <p>Первая версия ещё не отправлена.</p>}{item.history.map(v=><article className="solution-version" key={v.version}><header><h3>Версия {v.version}</h3><span className={`status-pill ${v.status}`}>{{pending:"На проверке",returned:"Нужны правки",accepted:"Принята"}[v.status]}</span></header><p>{v.result}</p><a href={v.link} target="_blank" rel="noreferrer">Открыть результат ↗</a>{v.comment && <p>Комментарий команды: {v.comment}</p>}{v.feedback && <blockquote>Бизнес: {v.feedback}</blockquote>}</article>)}{user.role === "student" && (!latest || latest.status === "returned") && <form onSubmit={e=>{e.preventDefault();action("submit",form);}}><h3>Отправить {latest ? "новую" : "первую"} версию</h3><label>Что сделано<textarea required maxLength={4000} value={form.result} onChange={e=>setForm({...form,result:e.target.value})}/></label><label>Ссылка на результат<input required type="url" value={form.link} onChange={e=>setForm({...form,link:e.target.value})}/></label><label>Комментарий<textarea maxLength={4000} value={form.comment} onChange={e=>setForm({...form,comment:e.target.value})}/></label><button disabled={busy} className="primary-button">Отправить решение</button></form>}{user.role === "business" && latest?.status === "pending" && <div><label>Комментарий команде · обязателен при возврате<textarea maxLength={4000} value={feedback} onChange={e=>setFeedback(e.target.value)}/></label><div className="review-actions"><button disabled={busy} className="primary-button" onClick={()=>action("review",{version:latest.version,decision:"accepted",comment:feedback})}>Принять работу</button><button disabled={busy || !feedback.trim()} className="outline-button" onClick={()=>action("review",{version:latest.version,decision:"returned",comment:feedback})}>Вернуть на доработку</button></div></div>}</section></>}</main>;
}
