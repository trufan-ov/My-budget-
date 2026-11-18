// Pure financial domain module. Amounts are always integer kopecks.
export const DAY = 86400000;
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function dateISO(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d,12); }
export function addDays(iso, n) { const d=parseDate(iso);d.setDate(d.getDate()+n);return dateISO(d); }
export function addMonths(iso, n) { const d=parseDate(iso); const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return dateISO(d); }
export function diffDays(a,b) { return Math.round((parseDate(b)-parseDate(a))/DAY); }
export function money(value) { const raw=String(value).trim().replace(/\s/g,'').replace(',','.'); if(!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Введите сумму без знака, максимум 2 знака после запятой'); const [r,k='']=raw.split('.');const result=Number(r)*100+Number(k.padEnd(2,'0'));if(!Number.isSafeInteger(result)||result<=0)throw new Error('Сумма должна быть больше нуля');return result; }
export const rub = c => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(c/100);
export function salaryDate(year,month,day,moveWeekends=true){const d=new Date(year,month-1,day,12);if(moveWeekends){if(d.getDay()===6)d.setDate(d.getDate()-1);if(d.getDay()===0)d.setDate(d.getDate()-2);}return dateISO(d);}
export function validateTransaction(tx){if(!['income','expense','transfer','interest'].includes(tx.kind))throw Error('Недопустимый тип операции');if(!Number.isSafeInteger(tx.amount)||tx.amount<=0)throw Error('Недопустимая сумма');if(!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)||dateISO(parseDate(tx.date))!==tx.date)throw Error('Некорректная дата');if(tx.kind==='transfer'&&!(tx.fromAccount&&tx.toAccount)&&!['toSavings','fromSavings'].includes(tx.direction))throw Error('Укажите направление перевода');}
export function accountList(state){
 const base=[{id:'main',name:'Основной счёт',opening:state.opening.available,includeInDaily:true},{id:'savings',name:'Копилка',opening:state.opening.savings,includeInDaily:false}];
 return [...base,...(state.accounts||[]).filter(a=>!['main','savings'].includes(a.id))];
}
export function accountBalances(state,day='9999-12-31'){
 const balances=Object.fromEntries(accountList(state).map(a=>[a.id,a.opening]));
 for(const tx of state.transactions.filter(t=>t.date<=day&&!t.historical&&(!state.openingDate||t.date>=state.openingDate)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
  validateTransaction(tx);
  if(tx.kind==='transfer'){
   const from=tx.fromAccount|| (tx.direction==='fromSavings'?'savings':'main');
   const to=tx.toAccount|| (tx.direction==='fromSavings'?'main':'savings');
   if(!(from in balances)||!(to in balances)||from===to)throw Error('Некорректные счета перевода');
   balances[from]-=tx.amount;balances[to]+=tx.amount;
  }else{
   const id=tx.accountId||(tx.kind==='interest'?'savings':'main');
   if(!(id in balances))throw Error('Счёт операции не найден');
   balances[id]+=tx.kind==='expense'?-tx.amount:tx.amount;
  }
 }
 return balances;
}
export function balanceAt(state,day='9999-12-31'){
 const accounts=accountBalances(state,day);
 const available=Object.entries(accounts).filter(([id])=>id!=='savings').reduce((n,[,v])=>n+v,0);
 const savings=accounts.savings||0;
 return {available,savings,total:available+savings};
}
export function record(state,transaction,options={}){
 const tx={id:uid(),date:dateISO(),category:'Другое',note:'',...transaction};
 validateTransaction(tx);
 if(state.transactions.some(t=>t.id===tx.id))throw Error('Дублирующийся идентификатор операции');
 if(state.openingDate&&tx.date<state.openingDate&&!tx.historical)throw Error('Операция раньше даты начальных остатков: импортируй её как историческую');
 const before=accountBalances(state,tx.date);
 const from=tx.fromAccount||(tx.direction==='fromSavings'?'savings':'main');
 const account=tx.accountId||(tx.kind==='interest'?'savings':'main');
 if(!options.allowNegative&&!tx.historical){
  if(tx.kind==='expense'&&(before[account]??-1)<tx.amount)throw Error('Недостаточно средств на выбранном счёте');
  if(tx.kind==='transfer'&&(before[from]??-1)<tx.amount)throw Error('Недостаточно средств для перевода');
 }
 const next={...state,transactions:[...state.transactions,tx]};
 accountBalances(next,tx.date);
 return next;
}
export function extraIncome(state,{amount,toSavings=0,date=dateISO(),note='Дополнительный доход'}){if(!Number.isSafeInteger(toSavings)||toSavings<0||toSavings>amount)throw Error('В копилку нельзя направить больше дохода');let next=record(state,{kind:'income',amount,date,category:'Доп. доход',note});if(toSavings)next=record(next,{kind:'transfer',direction:'toSavings',amount:toSavings,date,category:'Копилка',note:'Из дополнительного дохода',groupId:next.transactions.at(-1).id});return next;}
export function deleteTransaction(state,id){const found=state.transactions.find(t=>t.id===id);if(!found)return state;const ids=new Set([id]);if(found.kind==='income')for(const tx of state.transactions)if(tx.groupId===id)ids.add(tx.id);if(found.groupId)ids.add(found.groupId);const next={...state,transactions:state.transactions.filter(t=>!ids.has(t.id))};return next;}
export function futureOccurrences(state,start,end,includeCompleted=false){const out=[];for(const rule of state.rules){if(rule.enabled===false)continue;const s=parseDate(start), e=parseDate(end);for(let year=s.getFullYear()-1;year<=e.getFullYear()+1;year++)for(let month=1;month<=12;month++){
let occurrence=rule.type==='salary'?salaryDate(year,month,rule.day,rule.moveWeekends!==false):dateISO(new Date(year,month-1,Math.min(rule.day,new Date(year,month,0).getDate()),12));
if(occurrence<start||occurrence>end||(rule.start&&occurrence<rule.start)||(rule.end&&occurrence>rule.end))continue;
const id=`${rule.id}:${year}-${String(month).padStart(2,'0')}`;
out.push({id,ruleId:rule.id,date:occurrence,kind:['salary','income'].includes(rule.type)?'income':'expense',amount:rule.amount,title:rule.title,category:rule.category||'Обязательное',type:rule.type});}}
for(const item of state.oneOffs){if(item.date>=start&&item.date<=end)out.push({...item,kind:item.kind||'expense',type:'oneOff'});}
return out.filter(o=>includeCompleted||!state.transactions.some(t=>t.plannedId===o.id)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));}
export function nextSalaryDate(state,today){const until=addDays(today,90);return futureOccurrences(state,addDays(today,1),until).filter(x=>x.kind==='income'&&x.type==='salary').map(x=>x.date).sort()[0]||addDays(today,14);}
export function budgetSummary(state,today=dateISO()){const current=balanceAt(state,today),salary=nextSalaryDate(state,today),last=addDays(salary,-1),remaining=Math.max(1,diffDays(today,salary));const upcoming=futureOccurrences(state,today,last).filter(x=>x.kind==='expense');const reserved=upcoming.reduce((sum,x)=>sum+x.amount,0);const free=current.available-reserved;return {current,nextSalary:salary,days:remaining,reserved,free,daily:Math.max(0,Math.floor(free/remaining)),upcoming};}
// Salary-cycle planning. All amounts are integer kopecks.
export function salarySchedule(state,from,to){const out=[];const start=parseDate(from),end=parseDate(to);const salaryRules=state.rules.filter(r=>r.type==='salary'&&r.enabled!==false);for(let year=start.getFullYear()-1;year<=end.getFullYear()+1;year++)for(let month=1;month<=12;month++)for(const r of salaryRules){const date=salaryDate(year,month,r.day,r.moveWeekends!==false);if(date>=from&&date<=to)out.push({date,ruleId:r.id,title:r.title,amount:r.amount,id:`${r.id}:${year}-${String(month).padStart(2,'0')}`});}return out.sort((a,b)=>a.date.localeCompare(b.date)||a.ruleId.localeCompare(b.ruleId));}
export function salaryPeriod(state,today=dateISO()){const dates=salarySchedule(state,addDays(today,-65),addDays(today,90));const past=dates.filter(x=>x.date<=today);const next=dates.find(x=>x.date>today);const start=past.at(-1)?.date||today;const end=next?.date||addDays(today,14);const days=Math.max(1,diffDays(today,end));const available=balanceAt(state,today).available;const obligations=futureOccurrences(state,today,addDays(end,-1)).filter(x=>x.kind==='expense').reduce((sum,x)=>sum+x.amount,0);const prefs=state.settings?.planning||{};const target=Math.max(0,Number(prefs.dailyTarget)||0);const plannedSavings=Math.max(0,Number(prefs.savingsFixed)||0);const remaining=available-obligations-plannedSavings;const daily=Math.max(0,Math.floor(remaining/days));const deficit=Math.max(0,target*days-remaining);const surplus=Math.max(0,remaining-target*days);return {start,end,days,available,obligations,plannedSavings,remaining,daily,target,deficit,surplus,nextSalary:next,shortfall:Math.max(0,-remaining)};}
export function forecast(state,today=dateISO(),months=6){const initial=balanceAt(state,today);const end=addMonths(today,months);const events=futureOccurrences(state,addDays(today,1),end);const projected={available:initial.available,savings:initial.savings};const sorted=[];for(let month=0;month<months;month++){
const start=month===0?addDays(today,1):dateISO(new Date(parseDate(today).getFullYear(),parseDate(today).getMonth()+month,1,12));const until=dateISO(new Date(parseDate(start).getFullYear(),parseDate(start).getMonth()+1,0,12));const grouped=events.filter(x=>x.date>=start&&x.date<=until);for(const ev of grouped){if(ev.kind==='income')projected.available+=ev.amount;else projected.available-=ev.amount;}
// Forecast interest is an estimate; actual interest only enters balances as transactions.
const apr=Number(state.settings?.savingsApr||0);const interest=Math.max(0,Math.round(Math.max(projected.savings,0)*apr/1200));projected.savings+=interest;
sorted.push({month:start.slice(0,7),available:projected.available,savings:projected.savings,total:projected.available+projected.savings,interest,events:grouped.length});}
return sorted;}
export function validateState(s){
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&dateISO(parseDate(d))===d;
 const cents=n=>Number.isSafeInteger(n)&&n>=0;
 const positive=n=>Number.isSafeInteger(n)&&n>0;
 const unique=items=>new Set(items.map(x=>x.id)).size===items.length;
 if(!s||!s.opening||!cents(s.opening.available)||!cents(s.opening.savings)||!Array.isArray(s.transactions)||!Array.isArray(s.rules)||!Array.isArray(s.oneOffs))throw Error('Неверная структура данных');
 if(s.openingDate&&!validDate(s.openingDate))throw Error('Некорректная дата начального остатка');
 for(const t of s.transactions)validateTransaction(t);
 if(!unique(s.transactions)||s.transactions.some(t=>typeof t.id!=='string'||!t.id))throw Error('Повторяющиеся или пустые идентификаторы операций');
 if(s.accounts!==undefined){
  if(!Array.isArray(s.accounts)||!unique(s.accounts)||s.accounts.some(a=>!a||typeof a.id!=='string'||!a.id||['main','savings'].includes(a.id)||!cents(a.opening)||typeof a.name!=='string'||!a.name.trim()))throw Error('Некорректные счета');
 }
 if(s.debts!==undefined){
  if(!Array.isArray(s.debts)||!unique(s.debts)||s.debts.some(d=>!d||typeof d.id!=='string'||!d.id||!['borrowed','lent','creditCard'].includes(d.type)||!positive(d.principal)||!Number.isFinite(d.apr??0)||(d.apr??0)<0||(d.apr??0)>100||(d.creditLimit!==undefined&&!cents(d.creditLimit))||(d.dueDate&&!validDate(d.dueDate))||(d.graceUntil&&!validDate(d.graceUntil))||(d.schedule!==undefined&&(!Array.isArray(d.schedule)||d.schedule.some(p=>!validDate(p.date)||!positive(p.amount)||!cents(p.principal)||!cents(p.interest)||p.principal+p.interest!==p.amount)))))throw Error('Некорректные кредиты и графики');
  const debtIds=new Set(s.debts.map(d=>d.id));
  if(s.transactions.some(t=>t.debtId&&!debtIds.has(t.debtId)))throw Error('Операция ссылается на отсутствующий долг');
 }
 if(s.goals!==undefined&&(!Array.isArray(s.goals)||!unique(s.goals)||s.goals.some(g=>!g||!g.id||!validDate(g.date)||!positive(g.amount))))throw Error('Некорректные цели');
 if(s.installments!==undefined&&(!Array.isArray(s.installments)||!unique(s.installments)||s.installments.some(i=>!i||!i.id||!Array.isArray(i.payments)||!unique(i.payments)||i.payments.some(p=>!p.id||!validDate(p.date)||!positive(p.amount)))))throw Error('Некорректные рассрочки');
 if(s.importBatches!==undefined&&(!Array.isArray(s.importBatches)||!unique(s.importBatches)||s.importBatches.some(b=>!b||!b.id||!Array.isArray(b.ids)||b.ids.some(id=>typeof id!=='string'))))throw Error('Некорректная история импорта');
 if(!s.settings||!Number.isFinite(Number(s.settings.savingsApr))||Number(s.settings.savingsApr)<0||Number(s.settings.savingsApr)>100)throw Error('Некорректная ставка');
 accountBalances(s);
 return true;
}
export function demo(today=dateISO()){const [y,m]=today.split('-').map(Number);const openingDay=dateISO(new Date(y,m-1,1,12));const day=+today.slice(-2);const transactions=[{id:'demo-income',date:openingDay,kind:'income',amount:1200000,category:'Доп. доход',note:'Демонстрационное поступление'},{id:'demo-expense',date:dateISO(new Date(y,m-1,Math.min(3,day),12)),kind:'expense',amount:145000,category:'Продукты',note:'Пример покупки'},{id:'demo-transfer',date:dateISO(new Date(y,m-1,Math.min(4,day),12)),kind:'transfer',direction:'toSavings',amount:500000,category:'Копилка',note:'Пример пополнения'}];return {schemaVersion:1,createdAt:new Date().toISOString(),opening:{available:3500000,savings:1000000},transactions,rules:[{id:'salary-7',type:'salary',title:'Зарплата · 7 число',day:7,amount:3300000,moveWeekends:true,category:'Зарплата'},{id:'salary-23',type:'salary',title:'Зарплата · 23 число',day:23,amount:3300000,moveWeekends:true,category:'Зарплата'},{id:'internet',type:'expense',title:'Интернет',day:12,amount:130000,category:'Связь'},{id:'subscription',type:'expense',title:'Подписки',day:20,amount:200000,category:'Подписки'}],oneOffs:[],settings:{savingsApr:0,demo:true}};}

/* Salary-period planning. Monetary values are integer kopecks. */
export function salarySettings(state){const p=state.settings?.planning||{};return {comfortDaily:p.dailyTarget??p.comfortDaily??0,fixedSavings:p.savingsFixed??p.fixedSavings??0};}
export function salaryPeriods(state,today=dateISO(),count=4){
 const salaries=state.rules.filter(r=>r.type==='salary'&&r.enabled!==false);
 const base=parseDate(today),events=[];
 for(let shift=-2;shift<=5;shift++){const d=new Date(base.getFullYear(),base.getMonth()+shift,1,12);for(const r of salaries){const date=salaryDate(d.getFullYear(),d.getMonth()+1,r.day,r.moveWeekends!==false);events.push({date,rule:r,id:`${r.id}:${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`});}}
 events.sort((a,b)=>a.date.localeCompare(b.date));const unique=events.filter((e,i)=>!i||e.date!==events[i-1].date);
 const idx=Math.max(0,unique.findIndex((e,i)=>e.date<=today&&(!unique[i+1]||unique[i+1].date>today)));
 let carry=null;return unique.slice(idx,idx+count).map((start,i)=>{const end=unique[idx+i+1];if(!end)return null;const from=start.date,to=end.date;const current=from<=today&&today<to;const periodStart=current?today:from;
 const balance=current?balanceAt(state,today):{available:carry??balanceAt(state,addDays(from,-1)).available};
 const salaryTx=state.transactions.find(t=>t.plannedId===start.id);
 const expectedSalary=start.rule.amount;const salaryAmount=salaryTx?.amount??expectedSalary;
 const future=futureOccurrences(state,periodStart,addDays(to,-1));
 const obligations=future.filter(e=>e.kind==='expense').reduce((sum,e)=>sum+e.amount,0);
 const otherIncome=future.filter(e=>e.kind==='income'&&e.id!==start.id).reduce((sum,e)=>sum+e.amount,0);
 const income=(current?(!salaryTx&&from===today?0:0):salaryAmount)+otherIncome;
 const days=Math.max(1,diffDays(periodStart,to));
 const fixedSavings=salarySettings(state).fixedSavings;
 const projected=balance.available+income-obligations-fixedSavings;
 const availableDaily=Math.max(0,Math.floor(projected/days));
 const comfort=salarySettings(state).comfortDaily;
 const deficit=Math.max(0,comfort*days-projected);carry=projected-Math.max(0,comfort*days);
 return {from,to,current,days,expectedSalary,salaryAmount,salaryConfirmed:!!salaryTx,opening:balance.available,income,obligations,fixedSavings,projected,availableDaily,comfort,deficit,periodId:start.id,ruleId:start.rule.id};
 }).filter(Boolean);
}
