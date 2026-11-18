import {addDays,diffDays,balanceAt,futureOccurrences,forecast} from './core.mjs';
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
 const from=state.settings?.planning?.startDate||start;
 const recurring=futureOccurrences(state,from<start?from:start,end,true).filter(e=>e.kind!=='income'||e.date>=start).map(e=>({...e,originalDate:e.date,date:e.date<start?start:e.date}));
 const all=[...recurring,...installmentEvents(state,start,end),...goalEvents(state,start,end)];
 return all.map(e=>{
   const paid=actual.filter(t=>t.plannedId===e.id).reduce((a,t)=>a+t.amount,0);
   const closed=(state.closedPlans||[]).includes(e.id);
   return {...e,paid,remaining:closed?0:Math.max(0,e.amount-paid)};
 }).filter(e=>e.remaining>0);
}
export function dailyPlan(state,today,end){
 const balance=balanceAt(state,today),target=Math.max(0,state.settings?.planning?.dailyTarget??0);
 const days=Math.max(1,diffDays(today,addDays(end,1)));
 const opening=balance.available+(state.settings?.planning?.includeSavingsInDaily?balance.savings:0);
 const pending=pendingEvents(state,today,end),byDate=new Map();
 for(const e of pending){const item=byDate.get(e.date)||{income:0,expense:0};item[e.kind==='income'?'income':'expense']+=e.remaining;byDate.set(e.date,item);}
 let running=opening,cap=Infinity,firstShortfall=null;
 for(let i=0;i<days;i++){const day=addDays(today,i),e=byDate.get(day)||{income:0,expense:0};running+=e.income-e.expense;if(running<0&&!firstShortfall)firstShortfall={date:day,amount:-running};cap=Math.min(cap,Math.floor(Math.max(0,running)/(i+1)));}
 return {available:Math.max(0,running),free:running,deficit:Math.max(0,-running),daily:Math.max(0,Math.min(target,cap)),maximumDaily:Math.max(0,cap),days,firstShortfall,pending};
}
export function applyPersonalDraft(state){
 if(state.transactions.length||state.oneOffs.length||state.installments?.length||state.goals?.length||state.rules.length)throw Error('Предзаполнение доступно только для пустого бюджета. Сначала сохрани резервную копию.');
 return {...state,opening:{...personalDraft.opening},goals:personalDraft.goals.map(g=>({...g})),installments:personalDraft.installments.map(x=>({...x,payments:x.payments.map(p=>({...p}))})),rules:[
 {id:'salary-7',type:'salary',title:'Зарплата · 7 число',day:7,amount:personalDraft.salary,moveWeekends:true,category:'Зарплата'},
 {id:'salary-23',type:'salary',title:'Зарплата · 23 число',day:23,amount:personalDraft.salary,moveWeekends:true,category:'Зарплата'}],
 openingDate:personalDraft.asOf,settings:{...state.settings,savingsApr:11,planning:{...state.settings?.planning,dailyTarget:personalDraft.dailyTarget,savingsFixed:0,includeSavingsInDaily:false,startDate:personalDraft.asOf}}};
}

export function financeForecast(state,today,months=6,scenario='comfortable'){
 const initial=balanceAt(state,today),start=addDays(today,1);
 const first=new Date(today+'T12:00:00');
 const monthStart=(n)=>{const d=new Date(first.getFullYear(),first.getMonth()+n,1,12);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0')].join('-');};
 const end=monthStart(months)+'-01';
 const events=pendingEvents(state,start,end),byMonth=new Map();
 for(const e of events){const month=e.date.slice(0,7),p=byMonth.get(month)||{income:0,expense:0};p[e.kind==='income'?'income':'expense']+=e.remaining;byMonth.set(month,p);}
 let available=initial.available,savings=initial.savings;
 const target=state.settings?.planning?.dailyTarget??0;
 const daily=scenario==='economical'?Math.round(target*(1-(state.settings?.planning?.economyPercent??20)/100)):scenario==='actual'?(state.settings?.planning?.historicalDaily??target):target;
 const rows=[];
 for(let i=0;i<months;i++){
   const month=monthStart(i),next=monthStart(i+1);
   const from=i===0?start:month+'-01';
   const days=Math.max(0,diffDays(from,next));
   const p=byMonth.get(month)||{income:0,expense:0};
   available+=p.income-p.expense-daily*days;
   const interest=Math.max(0,Math.round(Math.max(0,savings)*Number(state.settings?.savingsApr||0)/1200));
   savings+=interest;
   rows.push({month,available,savings,total:available+savings,interest,events:events.filter(e=>e.date.slice(0,7)===month).length,daily});
 }
 return rows;
}
