import {addDays,diffDays,balanceAt,futureOccurrences} from './core.mjs';
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
export function goalEvents(state,start,end){
 return (state.goals||[]).filter(g=>g.date<=end).map(g=>({id:g.id,date:g.date<start?start:g.date,originalDate:g.date,title:g.title,amount:g.amount,kind:'expense',type:'goal',category:'Цель'}));
}
export function pendingEvents(state,start,end){
 const actual=state.transactions||[];
 const all=[...futureOccurrences(state,start,end),...installmentEvents(state,start,end),...goalEvents(state,start,end)];
 return all.map(e=>{
   const paid=actual.filter(t=>t.plannedId===e.id).reduce((a,t)=>a+t.amount,0);
   const closed=(state.closedPlans||[]).includes(e.id);
   return {...e,paid,remaining:closed?0:Math.max(0,e.amount-paid)};
 }).filter(e=>e.remaining>0);
}
export function dailyPlan(state,today,end){
 const balance=balanceAt(state,today);
 const target=Math.max(0,state.settings?.planning?.dailyTarget||0);
 const days=Math.max(1,diffDays(today,addDays(end,1)));
 const included=state.settings?.planning?.includeSavingsInDaily===true;
 const opening=balance.available+(included?balance.savings:0);
 const pending=pendingEvents(state,today,end);
 const incomes=pending.filter(e=>e.kind==='income');
 const expenses=pending.filter(e=>e.kind!=='income');
 let cash=opening, safe=Infinity,firstShortfall=null;
 for(let i=0;i<days;i++){
   const day=addDays(today,i);
   // Conservative intraday liquidity: expenses before uncertain income on the same date.
   const due=expenses.filter(e=>e.date===day).reduce((a,e)=>a+e.remaining,0);
   const before=cash-due;
   if(before<0&&!firstShortfall)firstShortfall={date:day,amount:-before};
   safe=Math.min(safe,Math.floor(Math.max(0,before)/(i+1)));
   cash=before+incomes.filter(e=>e.date===day).reduce((a,e)=>a+e.remaining,0);
 }
 // Maximum uniform spend that keeps all daily closing balances nonnegative.
 let cumulative=opening,cap=Infinity,shortfall=null;
 for(let i=0;i<days;i++){
   const day=addDays(today,i);
   const due=expenses.filter(e=>e.date===day).reduce((a,e)=>a+e.remaining,0);
   const incoming=incomes.filter(e=>e.date===day).reduce((a,e)=>a+e.remaining,0);
   if(cumulative-due<0&&!shortfall)shortfall={date:day,amount:due-cumulative};
   cumulative+=incoming-due;
   cap=Math.min(cap,Math.floor(Math.max(0,cumulative)/(i+1)));
 }
 const remaining=opening+incomes.reduce((a,e)=>a+e.remaining,0)-expenses.reduce((a,e)=>a+e.remaining,0);
 return {available:Math.max(0,remaining),free:remaining,deficit:Math.max(0,-remaining),daily:Math.max(0,Math.min(target||Infinity,cap)),maximumDaily:Math.max(0,cap),days,firstShortfall:shortfall||firstShortfall,pending};
}
export function applyPersonalDraft(state){
 if(state.transactions.length||state.oneOffs.length||state.installments?.length||state.goals?.length)throw Error('Предзаполнение доступно только для пустого бюджета. Сначала сохрани резервную копию.');
 return {...state,opening:{...personalDraft.opening},goals:personalDraft.goals.map(g=>({...g})),installments:personalDraft.installments.map(x=>({...x,payments:x.payments.map(p=>({...p}))})),rules:[
 {id:'salary-7',type:'salary',title:'Зарплата · 7 число',day:7,amount:personalDraft.salary,moveWeekends:true,category:'Зарплата'},
 {id:'salary-23',type:'salary',title:'Зарплата · 23 число',day:23,amount:personalDraft.salary,moveWeekends:true,category:'Зарплата'}],
 settings:{...state.settings,savingsApr:11,planning:{...state.settings?.planning,dailyTarget:personalDraft.dailyTarget,savingsFixed:0,includeSavingsInDaily:false}}};
}
