import {dailyPlan,pendingEvents,applyPersonalDraft,financeForecast,goalFundingStatus,goalPayments} from './finance.mjs';
import {dateISO,parseDate,addDays,addMonths,diffDays,money,rub,uid,record,assertNoNewOverdraft,recurringEditMonth,recurringRuleAt,reviseRecurringRule,extraIncome,deleteTransaction,balanceAt,futureOccurrences,budgetSummary,forecast,demo,validateState,salaryPeriod,salaryPeriods,salarySettings} from './core.mjs';
import {addDebt,payDebt,debtBalance,netWorth,repaymentSchedule,creditCardStatus} from './debts.mjs';
import {readXlsx,excelDate} from './xlsx.mjs';
import {parseBankStatement,unmatchedStatementRows,bankImportSnapshot,safeImportUndo} from './bank.mjs';
import {accountList,accountBalances,availableHistory,ledgerEntries} from './core.mjs';
import {load,save,downloadBackup,readBackup} from './storage.mjs';
let bankFileName='',bankPreviewPage=0,bankAccountId='main',bankRejectedRows=0,bankRead=0;let state;let active='home',tab='all',modal='',toastTimer,bankPreview=[],scenario='comfortable',forecastMonths=6;const root=document.getElementById('app');let today=dateISO();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(parseDate(s));
const fmtMonth=s=>new Intl.DateTimeFormat('ru-RU',{month:'short',year:'numeric'}).format(parseDate(`${s.slice(0,7)}-01`));
const shortMoney=c=>Number.isFinite(c)?rub(c).replace(',00',''):'—';
const summary=()=>budgetSummary(state,today);
const deadlineBudget=()=>dailyPlan(state,today,addDays(today,45));
function nextSalaryForUI(){const a=futureOccurrences(state,addDays(today,1),addDays(today,40)).find(e=>e.type==='salary');return a?.date||addDays(today,14);}
const titleMap={home:'Главная',history:'Операции',accounts:'Счета',debts:'Долги',plan:'План',forecast:'Прогноз',settings:'Настройки',more:'Ещё'};
function toast(msg,error=false){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className=`toast${error?' error':''}`;el.textContent=msg;document.body.append(el);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),3800);}
async function commit(next,message,onSaved){try{if(state?.settings?.demo===true&&next.settings?.demo===true)next={...next,settings:{...next.settings,demo:false}};validateState(next);await save(next,state);state=next;onSaved?.();render();if(message)toast(message);}catch(err){toast(err.message,true);}}
const navPaths={
 home:'M3 10.5 12 3l9 7.5 M5.5 9v11h5v-6h3v6h5V9',
 history:'M4 7h15l-4-4 M20 17H5l4 4',
 accounts:'M3.5 8V5.5L17 3v5 M3.5 8H21v12H3.5z M21 12h-6v4h6',
 debts:'M5 3.5h14v17l-3-1.5-4 1.5L8 19l-3 1.5z M8.5 8h7 M8.5 12h4.5',
 plan:'M4 6h16v14H4z M8 3v5 M16 3v5 M4 11h16 M8 15h3',
 forecast:'M3 20h18 M3 15l5-5 4 3 8-9 M15 4h5v5',
 settings:'M4 7h7m5 0h4 M4 17h2m5 0h9 M11 4.5h5v5h-5z M6 14.5h5v5H6z',
 more:'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
};
function navIcon(key){
 return `<svg class="nav-mark" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="round"><path d="${navPaths[key]}"/></svg>`;
}
function navButtons(){
 const items=[['home','Главная'],['history','Операции'],['accounts','Счета'],['debts','Долги'],['plan','План'],['forecast','Прогноз'],['settings','Настройки']];
 const mobile=[['home','Главная'],['history','Операции'],['plan','План'],['more','Ещё']];
 const moreActive=['more','accounts','debts','forecast','settings'].includes(active);
 return `<aside class="sidebar"><div class="brand"><span class="brand-symbol"><svg aria-hidden="true" viewBox="0 0 32 32" fill="currentColor"><path d="M2 25 8 7h5l2.6 8.5L22 7h5.5l-6.1 18h-5.1l3.3-9.7-6 7.6-2.5-8.1L7.5 25z"/></svg></span> Мой бюджет</div><nav class="nav" aria-label="Разделы бюджета">${items.map(([k,t])=>`<button data-nav="${k}" aria-current="${active===k?'page':'false'}" class="${active===k?'active':''}"><span class="nav-icon">${navIcon(k)}</span>${t}</button>`).join('')}</nav></aside>
 <nav class="mobile-nav" aria-label="Основная навигация">${mobile.map(([k,t])=>`<button data-nav="${k}" aria-label="${t}" aria-current="${(k==='more'?moreActive:active===k)?'page':'false'}" class="${(k==='more'?moreActive:active===k)?'active':''}"><span class="ico">${navIcon(k)}</span><span>${t}</span></button>`).join('')}</nav>`;
}

const openPanels=new Map();
function disclosure(id,title,content,{open=false,summary=''}={}){
 const expanded=openPanels.get(id)??open;
 return `<details class="card disclosure" data-panel="${id}" ${expanded?'open':''}>
  <summary><span>${title}</span>${summary?`<small>${summary}</small>`:'<span></span>'}</summary>
  <div class="disclosure-content">${content}</div>
 </details>`;
}

function morePage(){
 const items=[['accounts','Счета','Карты, наличные, переводы'],['debts','Долги и кредиты','Погашения и чистый капитал'],['forecast','Прогноз','Сценарии и накопления'],['settings','Настройки','Импорт, подписки, резервные копии']];
 return `<section class="card section"><h2 class="card-title">Финансы и настройки</h2><div class="more-links">${items.map(([k,t,sub])=>`<button class="more-link" data-nav="${k}"><span class="more-icon">${navIcon(k)}</span><span class="more-label"><strong>${t}</strong><small>${sub}</small></span><span class="more-chevron" aria-hidden="true">›</span></button>`).join('')}</div></section>`;
}

function top(){return `<header class="topline"><div><div class="eyebrow">${new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(parseDate(today))}</div><h1 class="title">${titleMap[active]}</h1></div><div class="top-date"><span class="local-dot">●</span> На устройстве</div></header>`;}
function itemTx(tx,editable=true){
 const title=tx.note||tx.category||'Операция';
 const incoming=tx.kind==='income'||tx.kind==='interest';
 let detail=tx.category||tx.kind,sign=incoming?'+':'−';
 if(tx.kind==='transfer'){
  const names=new Map(accountList(state).map(account=>[account.id,account.name]));
  const from=tx.fromAccount||(tx.direction==='fromSavings'?'savings':'main');
  const to=tx.toAccount||(tx.direction==='fromSavings'?'main':'savings');
  detail=(names.get(from)||'Счёт')+' → '+(names.get(to)||'Счёт');
  sign='';
 }
 const canEdit=!(tx.debtId||tx.groupId||state.transactions.some(item=>item.groupId===tx.id));
 return `<div class="item operation-item"><div><div class="name">${escape(title)}</div>
  <div class="sub">${editable?'':fmtDate(tx.date)+' · '}${escape(detail)}</div></div>
  <div class="item-end"><span class="amount ${incoming?'green':tx.kind==='expense'?'red':''}">${sign+shortMoney(tx.amount)}</span>
  ${editable?`<details class="operation-menu">
   <summary aria-label="Действия с операцией ${escape(title)}"><span aria-hidden="true">⋯</span></summary>
   <div class="operation-actions">
   ${canEdit?`<button class="btn small" data-edit="${escape(tx.id)}">Изменить</button>`:''}
   <button class="btn small danger" data-delete="${escape(tx.id)}">Удалить</button></div></details>`:''}
 </div></div>`;
}

let historyDays=30;
function balanceChart(){
 const points=availableHistory(state,today,historyDays);
 const periods=[7,30,90].map(days=>`<button type="button" data-history-days="${days}" aria-pressed="${days===historyDays}">${days} дн.</button>`).join('');
 const header=`<div class="plot-heading"><h2>Динамика остатка</h2><div class="plot-periods" role="group" aria-label="Период графика">${periods}</div></div>`;
 if(!points.length)return header+'<p class="empty">График появится после первой операции.</p>';
 const amounts=points.map(point=>point.available);
 const low=Math.min(...amounts),high=Math.max(...amounts);
 const dateFormat=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});
 const samples=points.map(({day,available},index)=>({
  x:points.length===1?98:2+index*96/(points.length-1),
  y:high===low?50:90-80*(available-low)/(high-low),
  amount:shortMoney(available),date:dateFormat.format(parseDate(day)),
 }));
 const line=samples.map(({x,y})=>x+","+y).join(" "),first=samples[0],last=samples.at(-1);
 const dates=first.date+" — "+last.date;
 return header+`<figure class="balance-plot">
 <div class="plot-reading"><strong data-plot-amount>${last.amount}</strong><span data-plot-date>${last.date}</span></div>
 <div class="plot-scale"><span>${shortMoney(high)}</span>${low!==high?`<span>${shortMoney(low)}</span>`: ''}</div>
 <div class="plot-stage">
 <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Доступный остаток, ${dates}. Минимум ${shortMoney(low)}, максимум ${shortMoney(high)}">
 <defs><linearGradient id="balance-fill" x2="0" y2="1"><stop stop-color="#254998" stop-opacity=".82"/><stop offset="1" stop-color="#101b33" stop-opacity=".08"/></linearGradient></defs>
 <path class="plot-grid" d="M0 10H100 M0 30H100 M0 50H100 M0 70H100 M0 90H100" vector-effect="non-scaling-stroke"/>
 <polygon points="${first.x},90 ${line} ${last.x},90" fill="url(#balance-fill)"/>
 <polyline points="${line}" fill="none" stroke="#577dd3" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
 <path data-plot-guide d="M${last.x} 4V96" stroke="#546fa5" vector-effect="non-scaling-stroke"/>
 <path data-plot-point d="M${last.x} ${last.y}h0.01" stroke="#f8faff" stroke-linecap="round" stroke-width="6" vector-effect="non-scaling-stroke"/></svg>
 ${samples.length>1?`<input class="plot-scrub" type="range" min="0" max="${samples.length-1}" value="${samples.length-1}" aria-label="Остаток по дате" aria-valuetext="${escape(last.date+" · "+last.amount)}" data-plot-points="${escape(JSON.stringify(samples))}">`: ''}</div>
 <figcaption><span>${first.date}</span>${first.date!==last.date?`<span>${last.date}</span>`: ''}</figcaption></figure>`;
}

root.addEventListener('input',event=>{
 const control=event.target.closest('[data-plot-points]');
 if(!control)return;
 const {x,y,amount,date}=JSON.parse(control.dataset.plotPoints)[Number(control.value)];
 const plot=control.closest('.balance-plot');
 plot.querySelector('[data-plot-amount]').textContent=amount;
 plot.querySelector('[data-plot-date]').textContent=date;
 plot.querySelector('[data-plot-guide]').setAttribute('d','M'+x+' 4V96');
 plot.querySelector('[data-plot-point]').setAttribute('d','M'+x+' '+y+'h0.01');
 control.setAttribute('aria-valuetext',date+' · '+amount);
});
function home(){const s=summary(),safe=deadlineBudget(),rows=state.transactions.filter(t=>t.date<=today).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5),next=pendingEvents(state,today,addDays(today,30)).slice(0,4);return `<div class="dashboard-overview"><section class="balance-section"><div class="balance-label">Доступно сейчас</div><div class="balance-value">${shortMoney(s.current.available)}</div><div class="balance-caption">Для расходов · без накоплений</div><div class="primary-actions"><button class="quick-action quick-main" data-modal="expense"><span>−</span> Расход</button><button class="quick-action" data-modal="income"><span>＋</span> Доход</button><button class="quick-action" data-modal="transfer"><span>↗</span> Перевод</button></div></section><section class="history-panel">${balanceChart()}</section><section class="insights"><div class="insight"><span class="insight-label">Копилка</span><strong>${shortMoney(s.current.savings)}</strong><button data-modal="transfer" class="insight-link">Управлять ↗</button></div><div class="insight"><span class="insight-label">Дневной лимит</span><strong>${shortMoney(safe.daily)}</strong><span class="insight-detail">Горизонт 45 дней</span></div><div class="insight"><span class="insight-label">Обязательства</span><strong>${shortMoney(s.reserved)}</strong><button data-nav="plan" class="insight-link">Посмотреть ↗</button></div></section></div>${safe.firstShortfall?`<div class="banner warning">Возможный дефицит ${fmtDate(safe.firstShortfall.date)}: ${shortMoney(safe.firstShortfall.amount)}. Проверьте счёт и сроки платежей.</div>`:''}<div class="home-columns"><section class="content-section"><div class="heading-row"><h2 class="card-title">Последние операции</h2><button class="text-link" data-nav="history">Все</button></div><div class="list-surface">${rows.length?rows.map(tx=>itemTx(tx,false)).join(''):'<div class="empty">Операций пока нет</div>'}</div></section><section class="content-section"><div class="heading-row"><h2 class="card-title">Ближайшие платежи</h2><button class="text-link" data-nav="plan">План</button></div><div class="list-surface">${next.length?next.map(p=>`<div class="item"><div><div class="name">${escape(p.title)}</div><div class="sub">${fmtDate(p.date)}</div></div><div class="amount ${p.kind==='income'?'green':''}">${p.kind==='income'?'+':'−'}${shortMoney(p.remaining)}</div></div>`).join(''):'<div class="empty">Событий пока нет</div>'}</div><div class="next-salary">Следующая зарплата <strong>${fmtDate(s.nextSalary)}</strong></div></section></div>`;}
function calendarPanel(){
 const events=pendingEvents(state,today,addDays(today,45));
 const dates=[...new Set(events.map(e=>e.date))].sort();
 return `<div class="calendar-items">
 ${dates.length?dates.map(date=>`<div class="item"><div><div class="name">${fmtDate(date)}</div><div class="sub">${events.filter(e=>e.date===date).map(e=>`${e.originalDate&&e.originalDate<today?'⚠ Просрочено с '+fmtDate(e.originalDate)+' · ':''}${escape(e.title)}`).join(' · ')}</div></div><strong>${shortMoney(events.filter(e=>e.date===date).reduce((sum,e)=>sum+(e.kind==='income'?e.remaining:-e.remaining),0))}</strong></div>`).join(''):'<div class="empty">Нет запланированных событий</div>'}</div>`;
}
function analyticsPanel(){
 const firstDay=addDays(today,-29);
 const expenses=ledgerEntries(state,today).filter(tx=>tx.kind==='expense'&&tx.date>=firstDay);
 const groups=new Map();
 for(const tx of expenses){
  const category=tx.category||'Другое';
  groups.set(category,(groups.get(category)||0)+tx.amount);
 }
 const total=expenses.reduce((sum,tx)=>sum+tx.amount,0);
 const categories=[...groups].sort((a,b)=>b[1]-a[1]);
 const content=total?`<ul class="expense-breakdown">${categories.map(([category,amount])=>{
  const share=amount/total*100;
  return `<li><div><span>${escape(category)}</span><strong>${shortMoney(amount)} · ${Math.round(share)}%</strong></div>
   <div class="category-track" aria-hidden="true"><span style="width:${share}%"></span></div></li>`;
 }).join('')}</ul>`:'<p class="empty">Нет расходов за этот период</p>';
 return disclosure('expense-report','Расходы по категориям',content,{summary:'30 дней · '+shortMoney(total)});
}
function debtsPage(){
 const settled=ledgerEntries(state,today);
 const balances=accountBalances(state,today);
 return `<section class="card section"><div class="heading-row"><h2 class="card-title">Чистый капитал</h2><button class="btn primary small" data-modal="debt">+ Добавить</button></div>
 <div class="big debt-total">${shortMoney(netWorth(state,balances,settled))}</div>
 ${(state.debts||[]).map(d=>{const b=debtBalance(d,settled);const card=d.type==='creditCard'?creditCardStatus(d,settled,today):null;return `<div class="item"><div><div class="name">${escape(d.title)}</div><div class="sub">${d.type==='lent'?'Мне должны':d.type==='creditCard'?'Кредитная карта':'Я должен'} · ${escape(d.apr)}% годовых ${d.dueDate?'· срок '+fmtDate(d.dueDate):''}${card?` · доступный лимит: ${card.availableLimit===null?'не указан':shortMoney(card.availableLimit)} · льготный период: ${card.graceStatus==='not-configured'?'не указан':card.graceStatus==='expired'?'истёк':card.graceStatus==='active'?'до '+fmtDate(card.graceUntil):'долг погашен'}`:''}</div></div><div class="item-end"><strong>${shortMoney(b.principal)}</strong>${b.principal? `<button class="btn small" data-debt-pay="${escape(d.id)}">Погасить</button>`:''}</div></div>${(d.schedule||[]).length?`<details class="section"><summary>Ориентировочный график (${d.schedule.length} платежей)</summary>${d.schedule.map(p=>`<div class="kpi-row"><span>${fmtDate(p.date)}</span><strong>${shortMoney(p.amount)} <small>(проценты ${shortMoney(p.interest)})</small></strong></div>`).join('')}</details>`:''}`}).join('')||'<div class="empty">Кредитов и долгов пока нет</div>'}
 ${disclosure('debt-model','Как считаются долги','<p class="muted">В остатке учтены проведённые платежи. Графики ориентировочные. Условия начисления процентов, льготный период и комиссии уточняйте по выписке банка.</p>')}</section>`;
}
function accounts(){
 const balances=accountBalances(state,today);
 const cards=accountList(state).map(account=>{
  const id=escape(account.id);
  const included=account.id==='savings'?!!state.settings?.planning?.includeSavingsInDaily:account.includeInDaily;
  const actions=`<div class="account-controls"><button class="btn small" data-account-toggle="${id}" aria-pressed="${included}">
   ${included?'Исключить из дневного бюджета':'Учитывать в дневном бюджете'}</button>
   ${account.id!=='savings'?`<button class="btn small danger" data-account-delete="${id}">Удалить счёт</button>`:''}</div>`;
  return `<div class="account-entry"><div class="item"><div><div class="name">${escape(account.name)}</div>
   <div class="sub">${included?'В дневном бюджете':'Вне дневного бюджета'}</div></div>
   <strong>${shortMoney(balances[account.id])}</strong></div>
   ${account.id==='main'?'':disclosure('account-'+id,'Управление счётом',actions)}</div>`;
 });
 return `<section class="card"><div class="heading-row account-head"><h2 class="card-title">Остатки</h2>
  <button class="btn small" data-modal="account-transfer">Перевод</button>
  <button class="btn primary small" data-modal="account">+ Счёт</button></div>${cards.join('')}</section>`;
}

const accountChoices=()=>accountList(state).map(a=>[a.id,a.name]);
const operationsPageSize=25;
let visibleOperations=operationsPageSize;

function history(){
 const rows=state.transactions.filter(tx=>tab==='all'||tx.kind===tab)
  .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const dates=new Map();
 for(const tx of rows.slice(0,visibleOperations)){
  if(!dates.has(tx.date))dates.set(tx.date,[]);
  dates.get(tx.date).push(tx);
 }
 const filters=[['all','Все'],['income','Доходы'],['expense','Расходы'],['transfer','Переводы'],['interest','Проценты']];
 return `<section class="card">
  <div class="heading-row operations-head"><div class="tabs" role="group" aria-label="Тип операции">${filters.map(([value,label])=>`
   <button data-tab="${value}" class="${tab===value?'active':''}" aria-pressed="${tab===value}">${label}</button>`).join('')}</div>
   <button class="btn primary small" data-modal="expense">+ Новая операция</button></div>
  ${rows.length?Array.from(dates,([day,transactions])=>`<section class="dated-operations">
   <h2>${fmtDate(day)}</h2>${transactions.map(tx=>itemTx(tx)).join('')}</section>`).join(''):'<div class="empty">Нет операций в этой категории</div>'}
  ${rows.length>visibleOperations?`<button class="btn history-more" data-show-operations>Показать ещё <span>${Math.min(operationsPageSize,rows.length-visibleOperations)}</span></button>`:''}
 </section>${analyticsPanel()}`;
}

function plannedRow(p){return `<div class="item"><div><div class="name">${escape(p.title)}</div><div class="sub">${p.originalDate&&p.originalDate<today?'⚠ Просрочено с '+fmtDate(p.originalDate):fmtDate(p.date)} · ${escape(p.category||'План')}</div></div><div class="item-end"><div class="amount ${p.kind==='income'?'green':'red'}">${p.kind==='income'?'+':'−'}${shortMoney(p.remaining??p.amount)}</div>${p.kind==='expense'&&['oneOff','expense'].includes(p.type)?`<button class="btn small" data-modal="planpay:${escape(p.id)}">Оплатить</button>`:`<button class="btn small" data-complete="${escape(p.id)}">Учесть</button>`}${p.type==='oneOff'?`<button class="btn small ghost" data-remove-plan="${escape(p.id)}">✕</button>`:''}</div></div>`;}
function cyclePanel(){const p=salaryPeriod(state,today);const difference=p.deficit;return `<section class="cycle-panel"><div class="cycle-eyebrow">Текущий зарплатный период</div><h2>${fmtDate(p.start)} — ${fmtDate(p.end)}</h2><div class="cycle-metrics"><div><span>Комфортно в день</span><strong>${shortMoney(p.target)}</strong></div><div><span>Доступно в день</span><strong>${shortMoney(p.daily)}</strong></div><div><span>До следующей зарплаты</span><strong>${p.days} дн.</strong></div></div><div class="cycle-details"><div><span>На карте</span><b>${shortMoney(p.available)}</b></div><div><span>Предстоящие обязательства</span><b>− ${shortMoney(p.obligations)}</b></div><div><span>План в копилку</span><b>− ${shortMoney(p.plannedSavings)}</b></div><div><span>На жизнь до зарплаты</span><b>${shortMoney(p.remaining)}</b></div></div>${difference>0?`<div class="cycle-warning"><strong>Дефицит комфортного бюджета: ${shortMoney(difference)}</strong><p>Можно уменьшить сумму в копилку, скорректировать расходы или пересмотреть обязательства. Изменения не применяются автоматически.</p><button class="btn small" data-nav="settings">Изменить план</button></div>`:`<div class="cycle-positive">Сверх комфортного бюджета: ${shortMoney(p.surplus)}. Можно рассмотреть перевод остатка в копилку в конце периода.</div>`}</section>`;}
function recurringRules(){
 const rules=state.rules.filter(rule=>rule.enabled!==false&&['expense','income','savings'].includes(rule.type)&&(!rule.end||rule.end>=today));
 return rules.map(rule=>{
  const current=recurringRuleAt(rule,today.slice(0,7));
  const pending=rule.revisions?.find(change=>change.month>today.slice(0,7));
  return `<div class="item"><div><div class="name">${escape(current.title)}</div><div class="sub">${current.day}-е число · ${shortMoney(current.amount)}${pending?" · изменение с "+fmtMonth(pending.month):""}</div></div><button class="btn small" data-rule-edit="${escape(rule.id)}">Изменить</button></div>`;
 }).join('');
}
function plan(){const safe=deadlineBudget();const funding=new Map(goalFundingStatus(state,today).map(g=>[g.id,g]));const pendingCustom=pendingEvents(state,addDays(today,-365),addDays(today,400)).filter(x=>x.type==='goal'||x.type==='installment');
const custom=[...(state.goals||[]).map(g=>{const paid=funding.get(g.id)?.paid||0,remaining=Math.max(0,g.amount-paid),reserved=funding.get(g.id)?.funded||0,closed=(state.closedPlans||[]).includes(g.id);return {id:g.id,title:g.title,type:'goal',date:g.date,originalDate:g.date,remaining,paid,reserved,closed,fullyFunded:remaining>0&&reserved>=remaining};}),...pendingCustom.filter(p=>p.type==='installment')];const periods=salaryPeriods(state,today,6);
 const customRow=p=>`<div class="item"><div><div class="name">${escape(p.title)}</div><div class="sub">До ${fmtDate(p.originalDate||p.date)} · ${p.type==='goal'?(p.closed?'Цель закрыта':p.remaining===0?'Цель оплачена':p.fullyFunded?'Цель накоплена · ожидает оплаты':'Цель · уже отложено '+shortMoney(p.reserved||0)):'Рассрочка'} · ${p.type==='goal'?'не оплачено':'осталось'} ${shortMoney(p.remaining)}</div></div><div class="item-end">${!p.closed&&p.remaining>0?`<button class="btn small" data-plan-pay="${escape(p.id)}">Оплатить</button>`:''}<button class="btn small ghost" data-plan-edit="${escape(p.id)}">✎</button><button class="btn small ghost" ${p.closed?`data-plan-reopen="${escape(p.id)}"`:`data-plan-close="${escape(p.id)}"`}>${p.closed?'Возобновить':'Закрыть'}</button></div></div>`;
 const payments=pendingEvents(state,today,addDays(today,45)).filter(x=>x.kind==='expense'&&x.type!=='goal'&&x.type!=='installment');
 return `<section class="card plan-summary"><h2 class="card-title">Безопасный дневной бюджет</h2><div class="kpi-row"><span>Комфортно в день</span><strong>${shortMoney(state.settings?.planning?.dailyTarget||0)}</strong></div><div class="big plan-limit">${shortMoney(safe.daily)} <small>в день</small></div><div class="kpi-row"><span>Прогноз остатка за 45 дней</span><strong>${shortMoney(safe.free)}</strong></div>${safe.firstShortfall?`<div class="deficit">Первый возможный дефицит ${fmtDate(safe.firstShortfall.date)}: ${shortMoney(safe.firstShortfall.amount)}. Проверь платежи и при необходимости переведи средства с другого счёта.</div>`:''}</section><section class="card section"><div class="heading-row"><h2 class="card-title">Обязательные платежи</h2><button class="btn primary small" data-modal="oneoff">+ Платёж</button></div>${payments.slice(0,4).map(plannedRow).join('')||'<div class="empty">Платежей пока нет</div>'}${payments.length>4?disclosure('plan-more-payments','Остальные платежи',payments.slice(4).map(plannedRow).join(''),{summary:String(payments.length-4)}):''}</section><section class="card section"><div class="heading-row"><h2 class="card-title">Цели и рассрочка</h2><button class="btn small" data-modal="goal">+ Цель</button><button class="btn small" data-modal="installment">+ Платёж рассрочки</button></div>${custom.slice(0,3).map(customRow).join('')||'<div class="empty">Пока нет целей и рассрочек</div>'}${custom.length>3?disclosure('plan-more-goals','Ещё цели и рассрочки',custom.slice(3).map(customRow).join(''),{summary:String(custom.length-3)}):''}</section>${disclosure('plan-periods','От зарплаты до зарплаты',`<div class="planning-intro"><div><p class="muted">Плановые поступления подтверждаются отдельно.</p></div><button class="btn" data-nav="settings" data-settings-panel="settings-planning">Настроить бюджет</button></div>${periods.length?periods.map((p,i)=>`<section class="period-panel ${p.current?'current-period':''}"><div class="period-top"><div><span class="period-kicker">${p.current?'Текущий период':'Прогноз · период '+(i+1)}</span><h2>${fmtDate(p.from)} — ${fmtDate(addDays(p.to,-1))}</h2></div><span class="period-days">${p.days} дн.</span></div><div class="period-limits"><div><span>Реально доступно в день</span><strong>${shortMoney(p.availableDaily)}</strong></div><div><span>Комфортная цель</span><strong>${shortMoney(p.comfort)}</strong></div></div>${p.deficit? `<div class="deficit"><strong>Не хватает ${shortMoney(p.deficit)}</strong><p>Можно уменьшить перевод в копилку, пересмотреть расходы или скорректировать цель. Ничего не меняется без твоего решения.</p></div>`:`<div class="surplus">Комфортная цель достижима по текущему плану.</div>`}<details class="period-details"><summary>Расчёт периода</summary><div class="period-breakdown"><div><span>Остаток на начало расчёта</span><strong>${shortMoney(p.opening)}</strong></div><div><span>Плановые поступления</span><strong>+${shortMoney(p.income)}</strong></div><div><span>Обязательные платежи</span><strong>−${shortMoney(p.obligations)}</strong></div><div><span>План в копилку</span><strong>−${shortMoney(p.fixedSavings)}</strong></div><div class="period-total"><span>На повседневные расходы</span><strong>${shortMoney(p.projected)}</strong></div></div></details>${!p.salaryConfirmed&&p.from<=today&&p.to>today?`<button class="btn primary" data-salary-confirm="${escape(p.periodId)}">Подтвердить зарплату · ${shortMoney(p.expectedSalary)}</button>`:''}</section>`).join(''):'<div class="note">Добавь зарплаты в настройках, чтобы построить план.</div>'}`)}${disclosure('plan-rules','Регулярные правила',`<button class="btn small" data-modal="rule">+ Правило</button>${recurringRules()||'<div class="empty">Правил пока нет</div>'}`)}${disclosure('plan-calendar','Календарь на 45 дней',calendarPanel())}`;}
function predictions(){
 const scenarios=[['comfortable','Комфортный'],['actual','По истории'],['economical','Экономный']];
 const controls=`<div class="forecast-controls">
  <div class="tabs" role="group" aria-label="Сценарий">${scenarios.map(([id,label])=>`<button data-scenario="${id}" class="${scenario===id?'active':''}" aria-pressed="${scenario===id}">${label}</button>`).join('')}</div>
  <div class="tabs" role="group" aria-label="Горизонт прогноза">${[3,6,12].map(n=>`<button data-horizon="${n}" class="${forecastMonths===n?'active':''}" aria-pressed="${forecastMonths===n}">${n} мес.</button>`).join('')}</div></div>`;
 let rows;
 try{rows=financeForecast(state,today,forecastMonths,scenario);}catch(error){
  return controls+`<section class="card"><p class="muted">${escape(error.message)}</p></section>`;
 }
 const last=rows.at(-1);
 const min=Math.min(0,...rows.map(row=>row.total)),max=Math.max(0,...rows.map(row=>row.total));
 const span=max-min||1,axis=max/span*100;
 const columns=rows.map(row=>`<div class="projection-month" role="listitem" aria-label="${escape(fmtMonth(row.month))}, ${shortMoney(row.total)}" title="${escape(fmtMonth(row.month))} · ${shortMoney(row.total)}">
  <div class="projection-track"><span class="projection-bar ${row.total<0?'negative':''}" style="top:${(max-Math.max(0,row.total))/span*100}%;height:${Math.abs(row.total)/span*100}%"></span></div>
  <span aria-hidden="true">${escape(fmtMonth(row.month).split(' ')[0].replace('.',''))}</span>
 </div>`).join('');
 const table=`<div class="forecast-table-wrap"><table class="forecast-table"><thead><tr><th>Месяц</th><th>Доступно</th><th>Копилка</th><th>Всего</th></tr></thead>
  <tbody>${rows.map(row=>`<tr><td>${escape(fmtMonth(row.month))}</td><td>${shortMoney(row.available)}</td><td>${shortMoney(row.savings)}</td><td><strong>${shortMoney(row.total)}</strong></td></tr>`).join('')}</tbody></table></div>`;
 const model=`<p class="muted">В прогнозе учтены плановые доходы, обязательства и повседневные расходы. Проценты по копилке оценочные.</p>
  <div class="kpi-row"><span>Ставка копилки</span><strong>${escape(state.settings.savingsApr)}% годовых</strong></div>
  <div class="action-row"><button class="btn small" data-nav="settings" data-settings-panel="settings-assumptions">Изменить ставку</button>
  <button class="btn small" data-modal="interest">+ Фактические проценты</button></div>`;
 return controls+`<section class="card forecast-overview"><h2 class="card-title">Прогноз по месяцам</h2>
  <div class="big">${shortMoney(last.total)}</div>
  <p class="muted">К концу периода · ${escape(fmtMonth(last.month))}</p>
  <div class="projection-chart" role="list" aria-label="Остаток по месяцам" style="--axis:${axis}%">${columns}</div>
 </section>${disclosure('forecast-table','Помесячные суммы',table)}${disclosure('forecast-model','Как рассчитан прогноз',model)}`;
}

function bankImport(){return `<div class="bank-import"><p class="muted">Поддерживаются CSV, TSV и XLSX с колонками «Дата», «Сумма», «Описание» (разделитель ; или ,). Отрицательная сумма — расход, положительная — поступление. Сначала проверьте операции: переводы между своими счетами требуют ручной классификации.</p><label class="field">Счёт выписки<select id="bank-account">${accountList(state).map(a=>`<option value="${escape(a.id)}" ${bankAccountId===a.id?'selected':''}>${escape(a.name)}</option>`).join('')}</select></label><input id="bank-csv" type="file" accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Выбрать CSV-выписку"><div id="bank-preview">${bankPreview.length?`<p class="muted">Найдено ${bankPreview.length} операций. Проверь классификацию на каждой странице предпросмотра перед импортом.</p>${bankRejectedRows?`<p class="note">Строк с некорректной датой или суммой: ${bankRejectedRows}. Они не попадут в импорт.</p>`:''}<div class="bank-preview-list">${bankPreview.slice(bankPreviewPage*30,(bankPreviewPage+1)*30).map((x,i)=>`<div class="item"><div><div class="name">${escape(x.note)}</div><div class="sub">${escape(x.date)} · ${escape(x.category)}</div><select data-bank-kind="${bankPreviewPage*30+i}" aria-label="Классификация операции"><option value="expense" ${x.kind==='expense'?'selected':''}>Расход</option><option value="income" ${x.kind==='income'?'selected':''}>Доход</option><option value="skip">Пропустить</option></select></div><strong>${shortMoney(x.amount)}</strong></div>`).join('')}</div><div class="action-row"><button class="btn small" data-bank-page="prev" ${bankPreviewPage===0?'disabled':''}>Назад</button><span class="muted">Страница ${bankPreviewPage+1} из ${Math.ceil(bankPreview.length/30)}</span><button class="btn small" data-bank-page="next" ${(bankPreviewPage+1)*30>=bankPreview.length?'disabled':''}>Вперёд</button></div><button class="btn primary" data-import-confirm>Импортировать ${bankPreview.length} операций</button>`:''}</div><div class="section"><h3 class="card-title">История импорта</h3>${(state.importBatches||[]).slice().reverse().map(b=>`<div class="item"><div><div class="name">${escape(b.filename||'Выписка')}</div><div class="sub">${escape(b.date)} · ${b.ids.length} операций</div></div><button class="btn small ghost" data-import-undo="${escape(b.id)}">Отменить</button></div>`).join('')||'<p class="muted">Импортов пока нет</p>'}</div></div>`;}
function settings(){const p=state.settings?.planning||{};const salary7=state.rules.find(r=>r.type==='salary'&&r.day===7);const salary23=state.rules.find(r=>r.type==='salary'&&r.day===23);
 const draft='<p class="muted">Черновик включает начальные остатки, зарплату, цели и рассрочку. Для применения потребуется подтверждение.</p><button class="btn" data-personal-seed>Применить мой черновик</button>';
 const subscriptions=`${(state.undatedObligations||[]).map(x=>`<div class="item"><div><div class="name">${escape(x.title)}</div><div class="sub">${shortMoney(x.amount)} в месяц · дата неизвестна</div></div><button class="btn small" data-subscription="${escape(x.id)}">Указать дату</button></div>`).join('')||'<div class="empty">Нет расходов без даты</div>'}`;
 return `<div class="settings-stack">
  ${disclosure('settings-planning','Зарплата и дневной бюджет',`<form class="form" data-form="planning"><div class="form-cols">${field('salary7','Зарплата 7-го, ₽','number',(salary7?.amount||0)/100,'min="0" step="0.01"')}${field('salary23','Зарплата 23-го, ₽','number',(salary23?.amount||0)/100,'min="0" step="0.01"')}</div><p class="muted">Если дата приходится на субботу или воскресенье, выплата переносится на предыдущую пятницу.</p><div class="form-cols">${field('dailyTarget','Комфортно в день, ₽','number',(p.dailyTarget||0)/100,'min="0" step="0.01"')}${field('savingsFixed','В копилку с зарплаты, ₽','number',(p.savingsFixed||0)/100,'min="0" step="0.01"')}</div><label class="check-row"><input type="checkbox" name="includeSavingsInDaily" value="yes" ${p.includeSavingsInDaily?'checked':''}> Учитывать копилку в дневном бюджете</label><button class="btn primary" type="submit">Сохранить финансовый план</button></form>`)}
  ${disclosure('settings-assumptions','Ставка копилки и сценарий',`<form class="form" data-form="settings"><div class="field"><label>Ставка копилки, % годовых (0–100)</label><input name="apr" type="number" min="0" max="100" step="0.01" required value="${escape(state.settings.savingsApr)}"></div><div class="field"><label>Экономный сценарий: снижение дневных расходов, %</label><input name="economyPercent" type="number" min="0" max="100" step="1" required value="${escape(state.settings?.planning?.economyPercent??20)}"></div><button class="btn primary" type="submit">Сохранить параметры</button></form>`)}
  ${disclosure('settings-import','Импорт выписки',bankImport(),{summary:bankPreview.length?'Предпросмотр готов':''})}
  ${disclosure('settings-backup','Резервная копия',`<p class="muted">Скачайте копию перед переносом или очисткой данных браузера.</p><div class="action-row"><button class="btn primary" data-export>↓ Скачать JSON</button><button class="btn" data-import>↑ Восстановить JSON</button><input id="import-file" type="file" accept=".json,application/json" style="display:none"></div>`,{summary:'JSON'})}
  ${state.undatedObligations?.length?disclosure('settings-subscriptions','Подписки без даты списания',subscriptions,{summary:String(state.undatedObligations.length)}):''}
  ${disclosure('settings-opening','Начальные остатки',`<p class="muted">Изменение стартовых сумм пересчитывает историю.</p><div class="kpi-row"><span>На счетах при старте</span><strong>${shortMoney(state.opening.available)}</strong></div><div class="kpi-row"><span>В копилке при старте</span><strong>${shortMoney(state.opening.savings)}</strong></div><button class="btn" data-modal="opening">Изменить начальные остатки</button>`)}
  ${disclosure('settings-draft','Подготовленный черновик',draft)}
  ${disclosure('settings-reset','Сброс бюджета',`<p class="muted">Сброс заменит текущий бюджет.</p><div class="action-row"><button class="btn" data-reset="empty">Новый пустой бюджет</button><button class="btn danger" data-reset="demo">Вернуть демо</button></div>`)}
 </div>`;
}
function render(){
 for(const panel of root.querySelectorAll('details[data-panel]'))openPanels.set(panel.dataset.panel,panel.open);
 today=dateISO();root.innerHTML=`<div class="app-shell">${navButtons()}<main class="main">${top()}${active==='home'?home():active==='history'?history():active==='accounts'?accounts():active==='debts'?debtsPage():active==='plan'?plan():active==='forecast'?predictions():active==='more'?morePage():settings()}</main></div>${modal?modalHTML(modal):''}`;}
const field=(name,label,type='text',value='',other='')=>`<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${escape(value)}" ${other} required></div>`;
const options=(name,label,choices,selected=null)=>`<div class="field"><label>${label}</label><select name="${name}">${choices.map(([v,t])=>`<option value="${escape(v)}" ${selected!==null&&v===selected?'selected':''}>${escape(t)}</option>`).join('')}</select></div>`;
function modalHTML(kind){let heading='',fields='';const date=field('date','Дата','date',today);const amount=field('amount','Сумма, ₽','number','', 'min="0.01" step="0.01" placeholder="1000"');const note=field('note','Описание','text','','placeholder="Необязательно"');
if(kind==='expense'){heading='Добавить расход';fields=options('accountId','Счёт',accountChoices())+amount+date+options('category','Категория',[['Продукты','Продукты'],['Транспорт','Транспорт'],['Кафе','Кафе'],['Связь','Связь'],['Подписки','Подписки'],['Здоровье','Здоровье'],['Развлечения','Развлечения'],['Другое','Другое']])+note;}
if(kind==='income'){heading='Дополнительный доход';fields=options('accountId','Счёт',accountChoices())+amount+field('savings','Сразу перевести в копилку, ₽','number','0','min="0" step="0.01"')+date+note;}
if(kind==='transfer'||kind==='account-transfer'){heading='Перевод между счетами';fields=options('fromAccount','Откуда',accountChoices())+options('toAccount','Куда',accountChoices())+amount+date+note;}
if(kind==='interest'){heading='Фактические проценты';fields=options('accountId','Счёт',accountChoices())+amount+date+note;}
if(kind==='debt'){heading='Новый долг или кредит';fields=field('title','Название','text')+options('type','Тип',[['borrowed','Взял в долг'],['lent','Дал в долг'],['creditCard','Кредитная карта']])+field('principal','Текущий основной долг, ₽','number','','min="0.01" step="0.01"')+field('apr','Ставка, % годовых','number','0','min="0" max="100" step="0.01"')+'<div class="field"><label for="f-months">Срок в месяцах (необязательно, для расчёта графика)</label><input id="f-months" name="months" type="number" min="1" max="600" step="1"></div>'+field('creditLimit','Кредитный лимит, ₽ (для кредитной карты)','number','0','min="0" step="0.01"')+'<div class="field"><label for="f-graceUntil">Конец льготного периода (необязательно)</label><input id="f-graceUntil" name="graceUntil" type="date"></div>'+field('dueDate','Дата погашения (ориентир)','date',addDays(today,30))+field('firstPaymentDate','Первый платёж графика (если указан срок в месяцах)','date',addDays(today,30));}
if(kind.startsWith('debtpay:')){const d=(state.debts||[]).find(x=>x.id===kind.slice(8));if(d){heading='Погашение: '+d.title;fields=field('principal','Основной долг, ₽','number',debtBalance(d,ledgerEntries(state)).principal/100,'min="0" step="0.01"')+field('interest','Проценты, ₽','number','0','min="0" step="0.01"')+options('accountId','Счёт',accountChoices())+field('date','Дата','date',today);}}
if(kind==='account'){heading='Новый счёт';fields=field('title','Название','text')+field('opening','Начальный остаток, ₽','number','0','min="0" step="0.01"')+options('daily','Включать в дневной бюджет',[['yes','Да'],['no','Нет']]);}
if(kind.startsWith('subscription:')){const x=(state.undatedObligations||[]).find(x=>x.id===kind.slice(13));if(x){heading='Уточнить подписку';fields=field('amount','Сумма, ₽','number',x.amount/100,'min="0.01" step="0.01"')+field('day','День списания','number','15','min="1" max="28"');}}
if(kind==='goal'){heading='Новая финансовая цель';fields=field('title','Название цели','text')+amount+field('date','Крайний срок','date',addDays(today,30))+field('funded','Уже отложено на цель, ₽ (без перевода денег)','number','0','min="0" step="0.01"')+options('fundedAccountId','Счёт, где находятся отложенные деньги',[['','Не выбран'],...accountChoices()]);}
if(kind==='installment'){heading='Новый платёж рассрочки';fields=field('title','Название рассрочки','text','Рассрочка')+amount+field('date','Крайний срок','date',addDays(today,30));}
if(kind.startsWith('planpay:')){const id=kind.slice(8),e=pendingEvents(state,addDays(today,-500),addDays(today,800)).find(x=>x.id===id),g=(state.goals||[]).find(x=>x.id===id);if(e||g){const paid=g?goalPayments(state,id).reduce((n,t)=>n+t.amount,0):0;heading='Частичное или полное исполнение';fields=field('amount','Оплачено сейчас, ₽','number',((g?Math.max(0,g.amount-paid):e.remaining)/100),'min="0.01" step="0.01"')+field('date','Дата оплаты','date',today)+(g||e.kind==='expense'&&e.type!=='savings'?options('accountId','Счёт списания',accountChoices(),g?.fundedAccountId||'main'):'');}}
if(kind.startsWith('planedit:')){const id=kind.slice(9),g=(state.goals||[]).find(x=>x.id===id),p=(state.installments||[]).flatMap(x=>x.payments).find(x=>x.id===id),e=g||p;if(e){heading='Изменить срок и сумму';fields=field('amount','Сумма по плану, ₽','number',e.amount/100,'min="0.01" step="0.01"')+field('date','Крайний срок','date',e.date)+(g?field('funded','Уже отложено на цель, ₽','number',(g.funded||0)/100,'min="0" step="0.01"')+options('fundedAccountId','Счёт резерва',[['','Не выбран'],...accountChoices()],g.fundedAccountId||''):'');}}
if(kind==='oneoff'){heading='Разовый запланированный платёж';fields=field('title','Название','text')+amount+field('date','Дата','date',addDays(today,1))+options('kind','Тип',[['expense','Расход'],['income','Доход']]);}
if(kind.startsWith('ruleedit:')){
 const rule=state.rules.find(rule=>rule.id===kind.slice(9));
 if(rule){
  const month=recurringEditMonth(state,rule.id,today);
  const values=recurringRuleAt(rule,month);
  heading='Изменить регулярное правило';
  fields='<p class="muted">Изменение с '+fmtMonth(month)+'</p>'+field('title','Название','text',values.title)
   +field('amount','Сумма, ₽','number',values.amount/100,'min="0.01" step="0.01"')
   +field('day','День месяца (1–28)','number',values.day,'min="1" max="28"');
 }
}
if(kind==='rule'){heading='Регулярное правило';fields=field('title','Название')+amount+field('day','День месяца (1–28)','number','10','min="1" max="28"')+options('type','Тип',[['expense','Регулярный расход'],['income','Регулярный доход'],['savings','Перевод в копилку'],['salary','Зарплата (перенос выходных)']]);}
if(kind.startsWith('edit:')){const tx=state.transactions.find(t=>t.id===kind.slice(5));if(tx){heading='Редактировать операцию';fields=field('amount','Сумма, ₽','number',tx.amount/100,'min="0.01" step="0.01"')+field('date','Дата','date',tx.date)+field('note','Описание','text',tx.note||'')+(tx.kind==='expense'&&tx.plannedId&&(state.goals||[]).some(g=>g.id===tx.plannedId)?options('accountId','Счёт списания',accountChoices(),tx.accountId||'main'):'')+(tx.kind==='transfer'?options('direction','Направление',[['toSavings','Из доступных в копилку'],['fromSavings','Из копилки в доступные']]):'');}}
if(kind.startsWith('salary:')){const p=salaryPeriods(state,today,2).find(x=>x.periodId===kind.slice(7));if(p){heading='Подтвердить зарплату';fields=field('amount','Фактически поступило, ₽','number',p.expectedSalary/100,'min="0.01" step="0.01"')+field('date','Дата поступления','date',today);}}if(kind==='opening'){heading='Начальные остатки';fields=field('available','Доступные средства, ₽','number',state.opening.available/100,'min="0" step="0.01"')+field('savings','Копилка, ₽','number',state.opening.savings/100,'min="0" step="0.01"');}
return `<div class="modal-bg" data-overlay><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${heading}</h2><button class="close" data-close aria-label="Закрыть">×</button></div><form class="form" data-form="${kind}">${fields}<div class="action-row"><button class="btn primary" type="submit">Сохранить</button><button class="btn" type="button" data-close>Отмена</button></div></form></div></div>`;}
function positive(value){return money(value);}
function zeroAllowed(value){return Number(value)===0?0:money(value);}
async function submit(form){const kind=form.dataset.form,f=Object.fromEntries(new FormData(form));try{let next=state;if(kind.startsWith('edit:')){const id=kind.slice(5),old=state.transactions.find(t=>t.id===id);if(!old)throw Error('Операция не найдена');if(old.debtId)throw Error('Для исправления погашения удалите его и проведите заново');if(old.groupId||state.transactions.some(t=>t.groupId===id))throw Error('Связанную операцию нужно удалить и создать заново');if(old.kind==='expense'&&old.plannedId&&(state.goals||[]).some(g=>g.id===old.plannedId)){
 const goal=state.goals.find(g=>g.id===old.plannedId);
 if(f.date>today)throw Error('Фактический платёж по цели нельзя перенести на будущую дату');
 const otherPaid=goalPayments(state,old.plannedId).filter(t=>t.id!==id).reduce((sum,t)=>sum+t.amount,0);
 if(positive(f.amount)>Math.max(0,goal.amount-otherPaid))throw Error('Сумма платежа превышает неоплаченный остаток цели');
}const without={...state,transactions:state.transactions.filter(t=>t.id!==id)};next=record(without,{...old,amount:positive(f.amount),date:f.date,note:f.note||'',...(old.kind==='expense'&&old.plannedId&&(state.goals||[]).some(g=>g.id===old.plannedId)?{accountId:f.accountId||'main'}:{}),...(old.kind==='transfer'?{direction:f.direction}:{})},{allowNegative:true});assertNoNewOverdraft(state,next);}if(kind.startsWith('salary:')){const p=salaryPeriods(state,today,2).find(x=>x.periodId===kind.slice(7));if(!p)throw Error('Период не найден');next=record(state,{kind:'income',amount:positive(f.amount),date:f.date,plannedId:p.periodId,category:'Зарплата',note:'Зарплата · фактическое поступление'});}if(kind==='planning'){const cents=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>100000000)throw Error('Введите неотрицательную сумму');return Math.round(n*100);};const salaryRules=[7,23].map(day=>{const existing=state.rules.find(r=>r.type==='salary'&&r.day===day);return {...(existing||{id:'salary-'+day,type:'salary',title:'Зарплата · '+day+' число',day,category:'Зарплата'}),amount:cents(f['salary'+day]),moveWeekends:true};});next={...state,rules:[...state.rules.filter(r=>!(r.type==='salary'&&(r.day===7||r.day===23))),...salaryRules],settings:{...state.settings,planning:{...state.settings?.planning,dailyTarget:cents(f.dailyTarget),savingsFixed:cents(f.savingsFixed),includeSavingsInDaily:f.includeSavingsInDaily==='yes'}}};} if(kind==='settings'){const apr=Number(f.apr),economyPercent=Number(f.economyPercent);if(!Number.isFinite(apr)||apr<0||apr>100)throw Error('Ставка от 0 до 100%');if(!Number.isInteger(economyPercent)||economyPercent<0||economyPercent>100)throw Error('Экономия от 0 до 100%');next={...state,settings:{...state.settings,savingsApr:apr,planning:{...state.settings?.planning,economyPercent}}};}if(kind==='opening'){next={...state,opening:{available:zeroAllowed(f.available),savings:zeroAllowed(f.savings)}};}if(kind==='expense'||kind==='transfer'||kind==='account-transfer'||kind==='interest'){next=record(state,{kind:kind==='account-transfer'?'transfer':kind,amount:positive(f.amount),date:f.date,category:f.category||'Другое',note:f.note||'',...(kind==='transfer'||kind==='account-transfer'?{fromAccount:f.fromAccount,toAccount:f.toAccount}:{accountId:f.accountId})});}if(kind==='income'){if(f.accountId==='main')next=extraIncome(state,{amount:positive(f.amount),toSavings:zeroAllowed(f.savings),date:f.date,note:f.note||'Дополнительный доход'});else{if(zeroAllowed(f.savings)>0)throw Error('Перевод в копилку доступен при зачислении на основной счёт');next=record(state,{kind:'income',accountId:f.accountId,amount:positive(f.amount),date:f.date,note:f.note||'Дополнительный доход'});}}
if(kind==='debt'){const principal=positive(f.principal),apr=Number(f.apr);next=addDebt(state,{title:f.title,type:f.type,principal,apr,creditLimit:zeroAllowed(f.creditLimit),graceUntil:f.graceUntil,dueDate:f.dueDate});if(f.months){const schedule=repaymentSchedule({principal,apr,months:Number(f.months),startDate:f.firstPaymentDate||f.dueDate||today});next={...next,debts:next.debts.map((d,i)=>i===next.debts.length-1?{...d,schedule}:d)};}}
if(kind.startsWith('debtpay:')){next=payDebt(state,kind.slice(8),{principal:zeroAllowed(f.principal),interest:zeroAllowed(f.interest),accountId:f.accountId,date:f.date});}
if(kind==='account'){const name=f.title.trim();if(!name)throw Error('Укажи название');next={...state,accounts:[...(state.accounts||[]),{id:uid(),name,opening:zeroAllowed(f.opening),includeInDaily:f.daily==='yes'}]};}if(kind.startsWith('subscription:')){const id=kind.slice(13),x=(state.undatedObligations||[]).find(x=>x.id===id);if(!x)throw Error('Подписка не найдена');const day=Number(f.day);if(!Number.isInteger(day)||day<1||day>28)throw Error('День от 1 до 28');next={...state,undatedObligations:state.undatedObligations.filter(x=>x.id!==id),rules:[...state.rules,{id:'subscription-'+id,type:'expense',title:x.title,day,amount:positive(f.amount),category:'Подписки',start:today}]};}if(kind==='goal'){next={...state,goals:[...(state.goals||[]),{id:uid(),title:f.title,date:f.date,amount:positive(f.amount),funded:zeroAllowed(f.funded),fundedAccountId:f.fundedAccountId||null}]};if(next.goals.at(-1).funded>next.goals.at(-1).amount)throw Error('Отложенная сумма превышает цель');}if(kind==='installment'){const loan={id:uid(),title:f.title||'Рассрочка',account:'main',payments:[{id:uid(),date:f.date,amount:positive(f.amount)}]};next={...state,installments:[...(state.installments||[]),loan]};}if(kind.startsWith('planpay:')){const id=kind.slice(8),e=pendingEvents(state,addDays(today,-500),addDays(today,800)).find(x=>x.id===id);const g=(state.goals||[]).find(x=>x.id===id);if(!e&&!g)throw Error('Платёж не найден');if(g&&(state.closedPlans||[]).includes(id))throw Error('Цель закрыта');const amt=positive(f.amount),paid=g?goalPayments(state,id).reduce((n,t)=>n+t.amount,0):0,remaining=g?Math.max(0,g.amount-paid):e.remaining;if(amt>remaining)throw Error('Сумма превышает остаток');if(g&&f.date>today)throw Error('Фактический платёж по цели нельзя провести будущей датой. Укажите дату оплаты после её совершения');next=record(state,{kind:e?.type==='savings'?'transfer':'expense',amount:amt,date:f.date,plannedId:id,category:g?'Цель':e.category,note:g?g.title:e.title,...(e?.type==='savings'?{direction:'toSavings'}:{accountId:f.accountId||'main'})});}if(kind.startsWith('planedit:')){const id=kind.slice(9),amt=positive(f.amount),funded=f.funded===undefined?0:zeroAllowed(f.funded);if(funded>amt)throw Error('Отложенная сумма превышает цель');next={...state,goals:(state.goals||[]).map(g=>g.id===id?{...g,amount:amt,date:f.date,funded,fundedAccountId:f.fundedAccountId||null}:g),installments:(state.installments||[]).map(l=>({...l,payments:l.payments.map(p=>p.id===id?{...p,amount:amt,date:f.date}:p)}))};}if(kind==='oneoff'){next={...state,oneOffs:[...state.oneOffs,{id:uid(),title:f.title,date:f.date,amount:positive(f.amount),kind:f.kind,category:'Разовый платёж'}]};}if(kind.startsWith('ruleedit:'))next=reviseRecurringRule(state,kind.slice(9),{title:f.title,day:Number(f.day),amount:positive(f.amount)},today);if(kind==='rule'){const d=Number(f.day);if(!Number.isInteger(d)||d<1||d>28)throw Error('День месяца должен быть от 1 до 28');next={...state,rules:[...state.rules,{id:uid(),start:today,title:f.title,day:d,amount:positive(f.amount),type:f.type,moveWeekends:f.type==='salary',category:f.type==='salary'?'Зарплата':'Регулярное'}]};}await commit(next,'Изменения сохранены · расчёты обновлены',()=>{modal='';});}catch(e){toast(e.message,true);}}
async function markComplete(id){const candidates=pendingEvents(state,addDays(today,-40),addDays(today,80));const event=candidates.find(x=>x.id===id);if(!event)return toast('Событие уже учтено либо недоступно',true);let amount=event.remaining,date=today;if(event.type==='salary'){const entered=prompt('Сколько фактически поступило, ₽?',String(event.remaining/100));if(entered===null)return;try{amount=positive(entered);}catch(e){return toast(e.message,true);}const enteredDate=prompt('Фактическая дата поступления (ГГГГ-ММ-ДД)',today);if(enteredDate===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(enteredDate)||dateISO(parseDate(enteredDate))!==enteredDate)return toast('Некорректная дата',true);date=enteredDate;}else if(!confirm(`Учесть «${event.title}» на ${shortMoney(event.remaining)} как фактическую операцию сегодня?`))return;try{if(amount>event.remaining)throw Error('Сумма превышает невыполненный остаток');await commit(event.type==='debt'?payDebt(state,event.debtId,{principal:amount,date}):event.type==='debtSchedule'?payDebt(state,event.debtId,{principal:event.principal,interest:event.interest,date,plannedId:event.id}):record(state,{kind:event.type==='savings'?'transfer':event.kind,amount,date,plannedId:event.id,category:event.category,note:event.title,...(event.type==='savings'?{direction:'toSavings'}:{})}),'Поступление или платёж учтены');}catch(err){toast(err.message,true);}}
root.addEventListener('click',event=>{
 const selected=event.target.closest('.operation-menu');
 for(const menu of root.querySelectorAll('.operation-menu[open]')){
  if(menu!==selected)menu.open=false;
 }
});
root.addEventListener('keydown',event=>{
 const menu=event.target.closest('.operation-menu[open]');
 if(event.key==='Escape'&&menu){menu.open=false;menu.querySelector('summary').focus();}
});
root.addEventListener('click',async ev=>{const el=ev.target.closest('button,[data-overlay]');if(!el)return;const d=el.dataset;if(d.historyDays){historyDays=Number(d.historyDays);render();root.querySelector('[data-history-days="'+historyDays+'"]')?.focus({preventScroll:true});return;}if(d.nav){active=d.nav;tab='all';visibleOperations=operationsPageSize;modal='';render();window.scrollTo(0,0);const panel=d.settingsPanel&&root.querySelector('details[data-panel="'+d.settingsPanel+'"]');if(panel){panel.open=true;panel.scrollIntoView({block:'start'});}}if(d.tab){tab=d.tab;visibleOperations=operationsPageSize;render();}if(d.showOperations!==undefined){visibleOperations+=operationsPageSize;render();}if(d.scenario){scenario=d.scenario;render();}if(d.horizon){forecastMonths=Number(d.horizon);render();}if(d.modal){modal=d.modal;render();}if(d.salaryConfirm){modal='salary:'+d.salaryConfirm;render();}if(d.close!==undefined||d.overlay!==undefined&&ev.target===el){modal='';render();}if(d.edit){modal='edit:'+d.edit;render();}if(d.delete){const tx=state.transactions.find(t=>t.id===d.delete);if(tx&&confirm(`Удалить операцию «${tx.note||tx.category}» на ${shortMoney(tx.amount)}?`))try{await commit(deleteTransaction(state,tx.id),'Операция удалена, балансы пересчитаны');}catch(error){toast(error.message,true);}}if(d.complete)await markComplete(d.complete);if(d.subscription){modal='subscription:'+d.subscription;render();}if(d.planPay){modal='planpay:'+d.planPay;render();}if(d.planEdit){modal='planedit:'+d.planEdit;render();}if(d.ruleEdit){modal='ruleedit:'+d.ruleEdit;render();}if(d.planClose){if(!(state.closedPlans||[]).includes(d.planClose)&&confirm('Закрыть невыполненный остаток? Резерв освободится, а цель останется в истории.'))await commit({...state,closedPlans:[...(state.closedPlans||[]),d.planClose]},'Цель закрыта, резерв освобождён');}if(d.planReopen){await commit({...state,closedPlans:(state.closedPlans||[]).filter(id=>id!==d.planReopen)},'Цель возобновлена');}if(d.personalSeed!==undefined){
 const isDemo=state.settings?.demo===true;
 const hasData=state.transactions.length||state.rules.length||state.oneOffs.length||(state.goals||[]).length||(state.installments||[]).length;
 if(hasData&&!isDemo){alert('В бюджете уже есть реальные данные. Черновик нельзя применить поверх них. Скачай JSON, затем создай пустой бюджет или восстанови резервную копию.');return;}
 if(!confirm(isDemo?'Заменить демонстрационные данные твоим финансовым черновиком? Демо-операции будут удалены.':'Применить финансовый черновик к пустому бюджету?'))return;
 try{await commit(applyPersonalDraft(state,{replaceDemo:isDemo}),'Персональный черновик применён');}catch(e){alert('Не удалось применить черновик: '+e.message);}
}if(d.debtPay){modal='debtpay:'+d.debtPay;render();}if(d.accountToggle==='savings'){await commit({...state,settings:{...state.settings,planning:{...state.settings?.planning,includeSavingsInDaily:!state.settings?.planning?.includeSavingsInDaily}}},'Участие копилки в дневном бюджете обновлено');}else if(d.accountToggle){const a=(state.accounts||[]).find(x=>x.id===d.accountToggle);if(a)await commit({...state,accounts:state.accounts.map(x=>x.id===a.id?{...x,includeInDaily:!x.includeInDaily}:x)},'Настройки счёта обновлены');}if(d.accountDelete){const a=(state.accounts||[]).find(x=>x.id===d.accountDelete);if(a){if(state.transactions.some(t=>t.accountId===a.id||t.fromAccount===a.id||t.toAccount===a.id))return alert('Нельзя удалить счёт с операциями');if(confirm('Удалить счёт? Начальный остаток не переносится автоматически.'))await commit({...state,accounts:state.accounts.filter(x=>x.id!==a.id)},'Счёт удалён');}}if(d.removeRule){if(confirm('Удалить регулярное правило? Уже проведённые операции останутся.'))await commit({...state,rules:state.rules.filter(x=>x.id!==d.removeRule)},'Правило удалено');}if(d.removePlan){if(confirm('Удалить плановое событие?'))await commit({...state,oneOffs:state.oneOffs.filter(x=>x.id!==d.removePlan)},'Событие удалено');}if(d.bankPage){bankPreviewPage=Math.max(0,Math.min(Math.ceil(bankPreview.length/30)-1,bankPreviewPage+(d.bankPage==='next'?1:-1)));render();}if(d.importUndo){const batch=(state.importBatches||[]).find(b=>b.id===d.importUndo);if(batch&&confirm(`Отменить импорт «${batch.filename}»? Изменённые операции удалены не будут.`)){try{await commit(safeImportUndo(state,batch),'Импорт отменён');}catch(err){alert(err.message);}}}if(d.importConfirm!==undefined){if(!bankPreview.length)return;const submitted=bankPreview;const fresh=unmatchedStatementRows(submitted.map(t=>({...t,accountId:bankAccountId})),state.transactions);if(!fresh.length)return toast('Все операции уже присутствуют');if(!confirm(`Добавить ${fresh.length} операций? Перед этим рекомендуем сделать резервную копию.`))return;const added=fresh.map(t=>({...t,id:uid(),accountId:bankAccountId,historical:!!state.openingDate&&t.date<=state.openingDate}));let next={...state,transactions:[...state.transactions,...added],importBatches:[...(state.importBatches||[]),{id:uid(),filename:bankFileName,date:today,ids:added.map(t=>t.id),snapshots:added.map(bankImportSnapshot)}]};await commit(next,`Импортировано ${fresh.length} операций`,()=>{if(bankPreview===submitted)bankPreview=[];});} if(d.export!==undefined)downloadBackup(state);if(d.import!==undefined)document.getElementById('import-file')?.click();if(d.reset){if(!confirm('Это полностью заменит текущие данные. Сначала скачай резервную копию. Продолжить?'))return;const newState=d.reset==='demo'?demo(today):{...demo(today),opening:{available:0,savings:0},transactions:[],rules:[],oneOffs:[],settings:{savingsApr:0,demo:false}};await commit(newState,'Новый набор данных создан');}});
root.addEventListener('submit',ev=>{if(ev.target.matches('form[data-form]')){ev.preventDefault();submit(ev.target);}});
root.addEventListener('change',async ev=>{if(ev.target.id==='bank-account'){bankAccountId=ev.target.value;return;}if(ev.target.dataset.bankKind!==undefined){const i=Number(ev.target.dataset.bankKind);if(bankPreview[i])bankPreview[i].kind=ev.target.value;return;}
if(ev.target.id==='bank-csv'){
 const file=ev.target.files?.[0];
 if(!file)return;
 const request=++bankRead;
 bankPreview=[];
 bankRejectedRows=0;
 render();
 try{
  let text;
  if(/\.xlsx$/i.test(file.name)){
   const workbook=await readXlsx(file);
   const dateIndex=(workbook.rows[0]||[]).findIndex(h=>/дата|date/i.test(String(h)));
   const rows=workbook.rows.map((row,i)=>row.map((cell,j)=>i>0&&j===dateIndex&&/^\d+(\.\d+)?$/.test(String(cell))?excelDate(cell,workbook.date1904):String(cell)));
   const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
   text=rows.map(row=>row.map(quote).join(';')).join('\n');
  }else if(/\.(csv|tsv)$/i.test(file.name)){
   text=await file.text();
  }else throw Error('Поддерживаются CSV, TSV и XLSX. Старый формат XLS сохрани в XLSX.');
  if(request!==bankRead)return;
  const {transactions,rejectedRows}=parseBankStatement(text);
  bankPreview=transactions;
  bankRejectedRows=rejectedRows;
  bankFileName=file.name;
  bankPreviewPage=0;
  render();
 }catch(error){
  if(request===bankRead)toast(error.message,true);
 }
 return;
}if(ev.target.id==='import-file'){const f=ev.target.files?.[0];if(!f)return;try{const backup=await readBackup(f);if(!confirm('Восстановление заменит все текущие данные. Продолжить?'))return;await commit(backup,'Резервная копия восстановлена');}catch(err){toast(err.message,true);}}});
try{state=await load();render();if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(()=>{});}catch(err){root.innerHTML=`<div class="boot"><h2>Не удалось открыть данные</h2><p>${escape(err.message)}</p><p>Проверь доступность IndexedDB и режим браузера.</p></div>`;}

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dateISO()!==today)render();});
window.addEventListener('focus',()=>{if(dateISO()!==today)render();});
