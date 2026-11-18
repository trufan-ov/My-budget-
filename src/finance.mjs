import {addDays,diffDays,balanceAt,accountBalances,accountList,futureOccurrences,forecast} from './core.mjs';
export const personalDraft = {
  asOf:'2026-11-18',opening:{available:346200,savings:750000},
  salary:3300000, dailyTarget:100000, savingsApr:11,
  goals:[{id:'stag',title:'Мальчишник',date:'2026-11-28',amount:500000},{id:'wedding',title:'Свадьба Матвея',date:'2026-12-05',amount:1000000}],
  installments:[{id:'installment-1',title:'Рассрочка',account:'main',payments:[
    ['2026-12-18',2048371],['2027-01-18',1058042],['2027-02-18',844831],
    ['2027-03-18',763589],['2027-04-18',763584],['2027-05-18',721312],
    ['2027-06-18',510964],['2027-07-18',376327],['2027-08-18',117168],['2027-09-18',69947]
  ].map(([date,amount],i)=>({id:'installment-1-'+i,date,amount}))}]
};
export function installmentEvents(state,start,end){
 return (state.installments||[]).flatMap(loan=>(loan.payments||[]).filter(p=>p.date<=end).map(p=>({id:p.id,date:p.date<start?start:p.date,originalDate:p.date,title:loan.title,amount:p.amount,kind:'expense',type:'installment',category:'Рассрочка'})));
}
export function goalPayments(state,goalId,through='9999-12-31'){
 return (state.transactions||[]).filter(t=>t.kind==='expense'&&t.plannedId===goalId&&t.date<=through&&!t.historical&&(!state.openingDate||t.date>=state.openingDate));
}

export function goalFundingStatus(state,day){
 if(!(state.goals||[]).length)return [];
 const balances=accountBalances(state,day);
 const allocated=new Map();
 return (state.goals||[]).map(g=>{
  const accountId=g.fundedAccountId||null;
  const payments=goalPayments(state,g.id,day);
  const paid=payments.reduce((sum,t)=>sum+t.amount,0);
  const paidFromReserve=payments.filter(t=>(t.accountId||'main')===accountId).reduce((sum,t)=>sum+t.amount,0);
  const closed=(state.closedPlans||[]).includes(g.id);
  const requested=closed?0:Math.max(0,(g.funded||0)-paidFromReserve);
  const outstanding=closed?0:Math.max(0,g.amount-paid);
  const already=accountId?allocated.get(accountId)||0:0;
  const balance=accountId?Math.max(0,balances[accountId]||0):0;
  const funded=accountId?Math.min(requested,outstanding,Math.max(0,balance-already)):0;
  if(accountId)allocated.set(accountId,already+funded);
  return {id:g.id,accountId,requested,funded,paid,unfunded:Math.max(0,outstanding-funded)};
 });
}
export function goalEvents(state,start,end,asOf=start){
 const funded=new Map(goalFundingStatus(state,asOf).map(g=>[g.id,g]));
 return (state.goals||[]).filter(g=>g.date<=end).map(g=>({id:g.id,date:g.date<start?start:g.date,originalDate:g.date,title:g.title,amount:funded.get(g.id).unfunded,kind:'expense',type:'goal',category:'Цель'}));
}
function outstandingDebtEvents(d,payments,start,end){
  if(Array.isArray(d.schedule)&&d.schedule.length){
   // Principal paid manually reduces upcoming scheduled principal instead of
   // leaving the full original schedule and counting the repayment twice.
   let manualPrincipal=payments.filter(t=>!t.plannedId?.startsWith('debt-schedule:'+d.id+':')).reduce((n,t)=>n+(t.principal||0),0);
   return d.schedule.map((p,i)=>{
    const id='debt-schedule:'+d.id+':'+i;
    const matched=payments.filter(t=>t.plannedId===id);
    const principalPaid=matched.reduce((n,t)=>n+(t.principal||0),0);
    const interestPaid=matched.reduce((n,t)=>n+(t.interest||0),0);
    const principalRemaining=Math.max(0,p.principal-principalPaid);
    const allocated=Math.min(manualPrincipal,principalRemaining);
    manualPrincipal-=allocated;
    const principal=Math.max(0,principalRemaining-allocated);
    const interest=Math.max(0,p.interest-interestPaid);
    return {id,debtId:d.id,date:p.date<start?start:p.date,originalDate:p.date,title:d.title+' — платёж '+(i+1),amount:principal+interest,kind:'expense',type:'debtSchedule',category:'Кредиты',principal,interest,paid:principalPaid+interestPaid+allocated,remaining:principal+interest};
   }).filter(p=>p.originalDate<=end);
  }
  const paid=payments.reduce((total,t)=>total+(t.principal||0),0);
  return d.dueDate&&d.dueDate<=end?[{id:'debt-due:'+d.id,debtId:d.id,date:d.dueDate<start?start:d.dueDate,originalDate:d.dueDate,title:d.title,amount:d.principal,paid,remaining:Math.max(0,d.principal-paid),kind:'expense',type:'debt',category:'Кредиты'}]:[];
}

export function pendingEvents(state,start,end,asOf=start){
 const actual=(state.transactions||[]).filter(t=>!t.historical&&(!state.openingDate||t.date>=state.openingDate));
 const plannedStart=state.settings?.planning?.startDate;
 const bookedMonths=new Map();
 for(const tx of actual){
  if(!tx.plannedId||tx.kind!=='expense')continue;
  const parts=/^(.*):(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(tx.plannedId);
  if(!parts)continue;
  const months=bookedMonths.get(parts[1])||new Set();
  months.add(parts[2]);
  bookedMonths.set(parts[1],months);
 }
 const recurring=state.rules.flatMap(rule=>{
  const knownMonths=bookedMonths.get(rule.id);
  const earliestBooked=knownMonths?[...knownMonths].sort()[0]+'-01':start;
  const configured=rule.start||plannedStart;
  const from=[start,asOf,configured||start,earliestBooked].sort()[0];
  return futureOccurrences({...state,rules:[rule],oneOffs:[]},from,end,true)
   .filter(event=>event.date>=start||(event.kind==='expense'&&(
    event.date>=asOf||Boolean(configured&&event.date>=configured)||knownMonths?.has(event.date.slice(0,7))
   )))
   .map(event=>({...event,originalDate:event.date,date:event.date<start?start:event.date}));
 });
 const oneOffs=(state.oneOffs||[]).filter(e=>e.date<=end&&(e.date>=start||(e.kind||'expense')==='expense')).map(e=>({...e,kind:e.kind||'expense',type:'oneOff',originalDate:e.date,date:e.date<start?start:e.date}));
 const debts=(state.debts||[]).filter(d=>d.type!=='lent').flatMap(d=>outstandingDebtEvents(d,actual.filter(t=>t.debtId===d.id),start,end));
 const all=[...recurring,...oneOffs,...installmentEvents(state,start,end),...goalEvents(state,start,end,asOf),...debts];
 return all.map(e=>{
   if(e.type==='debtSchedule'||e.type==='debt')return {...e,remaining:(state.closedPlans||[]).includes(e.id)?0:e.remaining};
   const paid=e.type==='goal'?0:actual.filter(t=>t.plannedId===e.id).reduce((a,t)=>a+t.amount,0);
   const closed=(state.closedPlans||[]).includes(e.id);
   return {...e,paid,remaining:closed?0:Math.max(0,e.amount-paid)};
 }).filter(e=>e.remaining>0).sort((a,b)=>a.date.localeCompare(b.date)||(a.originalDate||a.date).localeCompare(b.originalDate||b.date)||a.id.localeCompare(b.id));
}

function projectedBills(state,today,start,end){
 const billIds=new Set([
  ...state.oneOffs.filter(e=>(e.kind||'expense')==='expense').map(e=>e.id),
  ...(state.installments||[]).flatMap(loan=>loan.payments.map(p=>p.id)),
 ]);
 const recurringIds=new Set(state.rules.filter(rule=>rule.type==='expense').map(rule=>rule.id));
 const debts=new Map((state.debts||[]).filter(d=>d.type!=='lent').map(d=>[d.id,d]));
 const future=state.transactions.filter(tx=>{
  if(tx.kind!=='expense'||tx.date<=today||tx.historical||(state.openingDate&&tx.date<state.openingDate))return false;
  if(debts.has(tx.debtId))return true;
  if(!tx.plannedId)return false;
  const occurrence=/^(.*):\d{4}-\d{2}$/.exec(tx.plannedId);
  return billIds.has(tx.plannedId)||(occurrence&&recurringIds.has(occurrence[1]));
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const futureIds=new Set(future.map(tx=>tx.id));
 const snapshot=future.length?{...state,transactions:state.transactions.filter(tx=>!futureIds.has(tx.id))}:state;
 const events=pendingEvents(snapshot,start,end,today);
 const byId=new Map(events.map(e=>[e.id,e]));
 const outstanding=new Map(events.map(e=>[e.id,e.remaining]));
 const adjustments=[];
 const debtPayments=new Map();
 function offsetAtDueDate(id,amount,date){
  const offset=Math.min(amount,outstanding.get(id)||0);
  if(!offset)return;
  outstanding.set(id,outstanding.get(id)-offset);
  const due=byId.get(id).date;
  adjustments.push({date:due>date?due:date,accountId:'main',expense:-offset});
 }
 for(const tx of future){
  if(tx.date>end)break;
  adjustments.push({date:tx.date,accountId:tx.accountId||'main',expense:tx.amount});
  if(!debts.has(tx.debtId)){
   offsetAtDueDate(tx.plannedId,tx.amount,tx.date);
   continue;
  }
  let payments=debtPayments.get(tx.debtId);
  if(!payments){
   payments=snapshot.transactions.filter(t=>t.debtId===tx.debtId&&!t.historical&&(!state.openingDate||t.date>=state.openingDate));
   debtPayments.set(tx.debtId,payments);
  }
  payments.push(tx);
  // Apply the same allocation of principal and interest used by the calendar.
  for(const row of outstandingDebtEvents(debts.get(tx.debtId),payments,start,end)){
   const difference=(outstanding.get(row.id)||0)-row.remaining;
   if(difference>0)offsetAtDueDate(row.id,difference,tx.date);
  }
 }
 return {events,adjustments};
}

export function dailyPlan(state,today,end){
 const balance=balanceAt(state,today),target=Math.max(0,state.settings?.planning?.dailyTarget??0);
 const days=Math.max(1,diffDays(today,addDays(end,1)));
 const balances=accountBalances(state,today);
 const opening=accountList(state).filter(a=>a.includeInDaily||(a.id==='savings'&&state.settings?.planning?.includeSavingsInDaily)).reduce((sum,a)=>sum+(balances[a.id]||0),0);
 const {events:pending,adjustments}=projectedBills(state,today,today,end);
 const byDate=new Map();
 for(const e of pending){const item=byDate.get(e.date)||{income:0,expense:0};item[e.kind==='income'?'income':'expense']+=e.remaining;byDate.set(e.date,item);}
 const included=new Set(accountList(state).filter(a=>a.includeInDaily||(a.id==='savings'&&state.settings?.planning?.includeSavingsInDaily)).map(a=>a.id));
 for(const adjustment of adjustments){
  if(!included.has(adjustment.accountId))continue;
  const item=byDate.get(adjustment.date)||{income:0,expense:0};
  item.expense+=adjustment.expense;
  byDate.set(adjustment.date,item);
 }
 const funding=new Map(goalFundingStatus(state,today).map(g=>[g.id,g]));
 const earmarked=[...funding.values()].filter(g=>included.has(g.accountId)).reduce((sum,g)=>sum+g.funded,0);
 // Future-dated legacy goal transactions are absent from today's real balance.
 // Consume earmarked money first when payment comes from its reserve account.
 const future=(state.transactions||[]).filter(t=>t.kind==='expense'&&t.plannedId&&funding.has(t.plannedId)&&t.date>today&&t.date<=end&&!t.historical&&(!state.openingDate||t.date>=state.openingDate)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const consumed=new Map(),credited=new Map();
 const goalById=new Map((state.goals||[]).map(g=>[g.id,g]));
 for(const t of future){
   const goal=funding.get(t.plannedId),prior=consumed.get(t.plannedId)||0;
   const reserved=(t.accountId||'main')===goal.accountId?Math.min(t.amount,Math.max(0,goal.funded-prior)):0;
   consumed.set(t.plannedId,prior+reserved);
   const charge=included.has(t.accountId||'main')?t.amount-reserved:0;
   if(charge){const item=byDate.get(t.date)||{income:0,expense:0};item.expense+=charge;byDate.set(t.date,item);}
   const used=credited.get(t.plannedId)||0;
   const reduction=Math.min(Math.max(0,goal.unfunded-used),t.amount-reserved);
   const deadline=goalById.get(t.plannedId).date;
   const offsetDate=t.date>deadline?t.date:deadline;
   if(reduction===0||offsetDate>end)continue;
   credited.set(t.plannedId,used+reduction);
   const item=byDate.get(offsetDate)||{income:0,expense:0};
   item.expense-=reduction;
   byDate.set(offsetDate,item);
 }
 let running=opening-earmarked,cap=Infinity,firstShortfall=null;
 for(let i=0;i<days;i++){const day=addDays(today,i),e=byDate.get(day)||{income:0,expense:0};running+=e.income-e.expense;if(running<0&&!firstShortfall)firstShortfall={date:day,amount:-running};cap=Math.min(cap,Math.floor(Math.max(0,running)/(i+1)));}
 return {available:Math.max(0,running),free:running,deficit:Math.max(0,-running),daily:Math.max(0,Math.min(target,cap)),maximumDaily:Math.max(0,cap),days,firstShortfall,pending};
}
export function applyPersonalDraft(state,{replaceDemo=false}={}){
 const hasExisting=state.transactions.length||state.oneOffs.length||state.installments?.length||state.goals?.length||state.rules.length||state.debts?.length||state.accounts?.length||state.importBatches?.length;
 if(hasExisting&&!(replaceDemo&&state.settings?.demo===true))throw Error('В бюджете уже есть данные. Для защиты от потери операций импорт черновика разрешён только в пустой или демонстрационный бюджет.');
 return {...state,transactions:[],oneOffs:[],closedPlans:[],debts:[],accounts:[],importBatches:[],opening:{...personalDraft.opening},goals:personalDraft.goals.map(g=>({...g})),installments:personalDraft.installments.map(x=>({...x,payments:x.payments.map(p=>({...p}))})),rules:[
 {id:'salary-7',type:'salary',title:'Зарплата · 7 число',day:7,amount:personalDraft.salary,moveWeekends:true,category:'Зарплата'},
 {id:'salary-23',type:'salary',title:'Зарплата · 23 число',day:23,amount:personalDraft.salary,moveWeekends:true,category:'Зарплата'}],
 openingDate:personalDraft.asOf,undatedObligations:[{id:'chatgpt',title:'ChatGPT',amount:230000,period:'monthly'},{id:'other-subscriptions',title:'Другие подписки',amount:100000,period:'monthly'}],settings:{...state.settings,demo:false,savingsApr:11,planning:{...state.settings?.planning,dailyTarget:personalDraft.dailyTarget,savingsFixed:0,includeSavingsInDaily:false,startDate:personalDraft.asOf}}};
}

export function financeForecast(state,today,months=6,scenario='comfortable'){
 const initial=balanceAt(state,today),start=addDays(today,1);
 const first=new Date(today+'T12:00:00');
 const monthStart=(n)=>{const d=new Date(first.getFullYear(),first.getMonth()+n,1,12);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0')].join('-');};
 const end=monthStart(months)+'-01';
 const {events,adjustments}=projectedBills(state,today,start,addDays(end,-1));
 const byMonth=new Map();
 for(const adjustment of adjustments){
  const month=adjustment.date.slice(0,7);
  const item=byMonth.get(month)||{income:0,expense:0,savings:0};
  if(adjustment.accountId==='savings')item.savings-=adjustment.expense;
  else item.expense+=adjustment.expense;
  byMonth.set(month,item);
 }
 // Legacy future-dated goal payments are not in today's account balance.
 // Forecast them as future cash outflows rather than treating them as paid now.
 const futureGoalPayments=(state.transactions||[]).filter(t=>t.kind==='expense'&&t.plannedId&&(state.goals||[]).some(g=>g.id===t.plannedId)&&t.date>=start&&t.date<end&&!t.historical&&(!state.openingDate||t.date>=state.openingDate));
 const futureGoalById=new Map();
 const futureGoalFromReserve=new Map();
 const goalById=new Map((state.goals||[]).map(g=>[g.id,g]));
 for(const t of futureGoalPayments){
   futureGoalById.set(t.plannedId,(futureGoalById.get(t.plannedId)||0)+t.amount);
   if((t.accountId||'main')===goalById.get(t.plannedId)?.fundedAccountId)
     futureGoalFromReserve.set(t.plannedId,(futureGoalFromReserve.get(t.plannedId)||0)+t.amount);
 }
 const fundingById=new Map(goalFundingStatus(state,today).map(g=>[g.id,g]));
 const fundedGoals=goalFundingStatus(state,today).filter(g=>g.funded>0&&!(state.closedPlans||[]).includes(g.id));
 for(const e of events){const month=e.date.slice(0,7),p=byMonth.get(month)||{income:0,expense:0,savings:0};p[e.kind==='income'?'income':'expense']+=e.remaining;if(e.type==='savings')p.savings+=e.remaining;byMonth.set(month,p);}
 // A future payment replaces part of the goal's projected deadline expense.
 for(const t of futureGoalPayments){
   const month=t.date.slice(0,7),p=byMonth.get(month)||{income:0,expense:0,savings:0};
   if((t.accountId||'main')==='savings')p.savings-=t.amount;
   else p.expense+=t.amount;
   byMonth.set(month,p);
 }
 // Offset a future payment only when it occurs, never before the cash leaves.
 // For payments before the deadline, offset the obligation at its due month.
 const reserveUsedByGoal=new Map(),unfundedUsedByGoal=new Map();
 for(const t of [...futureGoalPayments].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
   const goal=goalById.get(t.plannedId),funding=fundingById.get(t.plannedId);
   if(!goal||!funding||(state.closedPlans||[]).includes(goal.id))continue;
   const fromReserve=(t.accountId||'main')===funding.accountId;
   const reserved=fromReserve?Math.min(t.amount,Math.max(0,funding.funded-(reserveUsedByGoal.get(goal.id)||0))):0;
   reserveUsedByGoal.set(goal.id,(reserveUsedByGoal.get(goal.id)||0)+reserved);
   const offset=Math.min(t.amount-reserved,Math.max(0,funding.unfunded-(unfundedUsedByGoal.get(goal.id)||0)));
   unfundedUsedByGoal.set(goal.id,(unfundedUsedByGoal.get(goal.id)||0)+offset);
   if(offset){
     const due=goal.date<start?start:goal.date;
     const month=(t.date>due?t.date:due).slice(0,7);
     const p=byMonth.get(month)||{income:0,expense:0,savings:0};
     p.expense-=offset;
     byMonth.set(month,p);
   }
 }

 let available=initial.available,savings=initial.savings;
 const target=Number(state.settings?.planning?.dailyTarget??0);
 if(!Number.isSafeInteger(target)||target<0)throw Error('Некорректный дневной бюджет. Проверьте настройки финансового плана');
 const recent=(state.transactions||[]).filter(t=>t.kind==='expense'&&!t.plannedId&&!t.debtId&&!t.historical&&!['Долги','Кредиты','Рассрочка','Цель','Копилка'].includes(t.category)&&t.date>=addDays(today,-30)&&t.date<=today);
 const observed=recent.length?Math.round(recent.reduce((a,t)=>a+t.amount,0)/30):null;
 if(scenario==='actual'&&observed===null)throw Error('Недостаточно фактических расходов за последние 30 дней для прогноза по истории');
 const economy=Number(state.settings?.planning?.economyPercent??20);
 if(!Number.isFinite(economy)||economy<0||economy>100)throw Error('Некорректный процент экономии в настройках');
 const daily=scenario==='economical'?Math.round(target*(1-economy/100)):scenario==='actual'?observed:target;
 if(!Number.isSafeInteger(daily)||daily<0)throw Error('Не удалось рассчитать дневные расходы для прогноза');
 const rows=[];
 for(let i=0;i<months;i++){
   const month=monthStart(i),next=monthStart(i+1);
   const from=i===0?start:month+'-01';
   const days=Math.max(0,diffDays(from,next+'-01'));
   const p=byMonth.get(month)||{income:0,expense:0,savings:0};
   available+=p.income-p.expense-daily*days;
   savings+=p.savings;
   // Goal money remains in the real account until the goal is paid.
   // At its deadline it leaves that account, even if it was already earmarked.
   for(const funded of fundedGoals){
     const goal=goalById.get(funded.id);
     const due=goal.date<start?start:goal.date;
     if(due.slice(0,7)!==month)continue;
     const futurePaid=futureGoalById.get(funded.id)||0;
     const fromReserve=futureGoalFromReserve.get(funded.id)||0;
     const fromOther=futurePaid-fromReserve;
     const remainingFunded=Math.max(0,funded.funded-Math.min(funded.funded,fromReserve)-Math.max(0,fromOther-funded.unfunded));
     if(funded.accountId==='savings')savings-=remainingFunded;
     else available-=remainingFunded;
   }
   const apr=Number(state.settings?.savingsApr??0);
   if(!Number.isFinite(apr)||apr<0||apr>100)throw Error('Некорректная ставка накоплений. Укажите значение от 0 до 100%');
   const interest=Math.max(0,Math.round(Math.max(0,savings)*apr/1200));
   savings+=interest;
   if(!Number.isSafeInteger(available)||!Number.isSafeInteger(savings)||!Number.isSafeInteger(interest))throw Error('Прогноз содержит некорректные суммы. Проверьте операции, счета и параметры бюджета');
   rows.push({month,available,savings,total:available+savings,interest,events:events.filter(e=>e.date.slice(0,7)===month).length,daily});
 }
 return rows;
}
