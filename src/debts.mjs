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
export function payDebt(state,id,{principal,interest=0,date,accountId='main'}){
 const debt=(state.debts||[]).find(d=>d.id===id);
 if(!debt)throw Error('Долг не найден');
 if(!Number.isSafeInteger(principal)||principal<0||!Number.isSafeInteger(interest)||interest<0||principal+interest<=0)throw Error('Некорректная сумма');
 const outstanding=debtBalance(debt,state.transactions).principal;
 if(principal>outstanding)throw Error('Погашение превышает остаток долга');
 // Borrowed debt repayment is a cash outflow; lent debt repayment is a cash inflow.
 const kind=debt.type==='lent'?'income':'expense';
 const next=record(state,{kind,amount:principal+interest,date,accountId,category:'Долги',note:'Погашение: '+debt.title,debtId:id,principal,interest});
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
