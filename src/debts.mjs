import {uid,record} from './core.mjs';
export function debtBalance(debt,transactions=[]){
 const settled=transactions.filter(t=>t.debtId===debt.id);
 const principalPaid=settled.reduce((n,t)=>n+(t.principal||0),0);
 const interestPaid=settled.reduce((n,t)=>n+(t.interest||0),0);
 return {principal:Math.max(0,debt.principal-principalPaid),principalPaid,interestPaid};
}
export function addDebt(state,{title,type,principal,apr=0,dueDate='',creditLimit=0,graceUntil=''}) {
 if(!['borrowed','lent','creditCard'].includes(type)||!title?.trim()||!Number.isSafeInteger(principal)||principal<=0)throw Error('Проверь параметры долга');
 if(!Number.isFinite(apr)||apr<0||apr>100)throw Error('Некорректная ставка');
 const debt={id:uid(),title:title.trim(),type,principal,apr,dueDate,creditLimit,graceUntil,createdAt:new Date().toISOString()};
 return {...state,debts:[...(state.debts||[]),debt]};
}
export function payDebt(state,id,{principal,interest=0,date,accountId='main',plannedId}){
 const debt=(state.debts||[]).find(d=>d.id===id);
 if(!debt)throw Error('Долг не найден');
 if(!Number.isSafeInteger(principal)||principal<0||!Number.isSafeInteger(interest)||interest<0||principal+interest<=0)throw Error('Некорректная сумма');
 const outstanding=debtBalance(debt,state.transactions).principal;
 if(principal>outstanding)throw Error('Погашение превышает остаток долга');
 // Borrowed debt repayment is a cash outflow; lent debt repayment is a cash inflow.
 const kind=debt.type==='lent'?'income':'expense';
 const next=record(state,{kind,amount:principal+interest,date,accountId,category:'Долги',note:'Погашение: '+debt.title,debtId:id,principal,interest,...(plannedId?{plannedId}:{})});
 return next;
}
export function netWorth(state,balances){
 const assets=Object.values(balances).reduce((a,b)=>a+b,0);
 const debts=(state.debts||[]).reduce((sum,d)=>{
  const p=debtBalance(d,state.transactions).principal;
  return sum+(d.type==='lent'?p:-p);
 },0);
 return assets+debts;
}

/**
 * Indicative equal-payment schedule. Interest is estimated on the remaining
 * principal; bank fees, changing rates and grace rules are not assumed.
 * All money values are integer kopecks.
 */
export function repaymentSchedule({principal,apr=0,months,startDate}){
 if(!Number.isSafeInteger(principal)||principal<=0||!Number.isInteger(months)||months<1||months>600||!Number.isFinite(apr)||apr<0||apr>100)throw Error('Некорректные параметры графика');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!Number.isFinite(Date.parse(startDate+'T12:00:00Z')))throw Error('Некорректная дата графика');
 const rate=apr/1200;
 const payment=rate?Math.ceil(principal*rate/(1-Math.pow(1+rate,-months))):Math.ceil(principal/months);
 let outstanding=principal;const rows=[];
 for(let i=0;i<months;i++){
  const interest=Math.round(outstanding*rate);
  const principalPart=i===months-1?outstanding:Math.min(outstanding,Math.max(0,payment-interest));
  if(principalPart===0)throw Error('Платёж не покрывает проценты');
  outstanding-=principalPart;
  const d=new Date(startDate+'T12:00:00Z'),day=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+i);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last));
  rows.push({date:d.toISOString().slice(0,10),principal:principalPart,interest,amount:principalPart+interest,remaining:outstanding});
 }
 return rows;
}
