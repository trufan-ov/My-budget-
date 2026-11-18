import test from 'node:test';import assert from 'node:assert/strict';
import {demo,money,record,assertNoNewOverdraft,extraIncome,deleteTransaction,balanceAt,budgetSummary,salaryDate,forecast,futureOccurrences,validateState} from '../src/core.mjs';
const blank=()=>({...demo('2026-11-18'),opening:{available:2000000,savings:1000000},transactions:[],rules:[],oneOffs:[],settings:{savingsApr:0}});
test('amounts in kopecks and input validation',()=>{assert.equal(money('12 000,45'),1200045);assert.throws(()=>money('10.001'));assert.throws(()=>money('-2'));});
test('income distributed to savings conserves total',()=>{const s=blank(),next=extraIncome(s,{amount:1200000,toSavings:1000000,date:'2026-11-18'}),a=balanceAt(s),b=balanceAt(next);assert.equal(b.available-a.available,200000);assert.equal(b.savings-a.savings,1000000);assert.equal(b.total-a.total,1200000);});
test('revert grouped income also reverts linked transfer',()=>{const s=blank(),next=extraIncome(s,{amount:1200000,toSavings:1000000,date:'2026-11-18'});assert.deepEqual(balanceAt(deleteTransaction(next,next.transactions[0].id)),balanceAt(s));});
test('reverse transfer restores balances',()=>{const s=blank();const next=record(s,{kind:'transfer',direction:'toSavings',amount:300000,date:'2026-11-18'});assert.equal(balanceAt(next).savings,1300000);assert.deepEqual(balanceAt(deleteTransaction(next,next.transactions[0].id)),balanceAt(s));});
test('insufficient funds prevents transfer',()=>assert.throws(()=>record(blank(),{kind:'transfer',direction:'toSavings',amount:3000000,date:'2026-11-18'})));
test('salary moves Saturday and Sunday to Friday',()=>{assert.equal(salaryDate(2026,11,7),'2026-11-06');assert.equal(salaryDate(2026,5,23),'2026-05-22');assert.equal(salaryDate(2026,11,23),'2026-11-23');});
test('planned salary does not affect current balance',()=>{const s=blank();s.rules=[{id:'salary',type:'salary',day:23,title:'Зарплата',amount:3300000}];assert.equal(balanceAt(s,'2026-11-18').available,2000000);assert.ok(futureOccurrences(s,'2026-11-19','2026-11-30').length===1);});
test('budget limit recomputes after transfer',()=>{const s=blank();s.rules=[{id:'salary',type:'salary',day:23,title:'Зарплата',amount:3300000}];const initial=budgetSummary(s,'2026-11-18');const next=record(s,{kind:'transfer',direction:'toSavings',amount:1000000,date:'2026-11-18'});assert.ok(budgetSummary(next,'2026-11-18').daily<initial.daily);});
test('planned payment reserve excluded from daily spend',()=>{const s=blank();s.rules=[{id:'salary',type:'salary',day:23,title:'Зарплата',amount:3300000}];s.oneOffs=[{id:'bill',date:'2026-11-20',title:'Счёт',amount:500000,kind:'expense'}];assert.equal(budgetSummary(s,'2026-11-18').reserved,500000);});
test('payment marked as completed only once',()=>{const s=blank();s.oneOffs=[{id:'bill',date:'2026-11-20',title:'Счёт',amount:100000,kind:'expense'}];const t=record(s,{kind:'expense',date:'2026-11-18',amount:100000,plannedId:'bill'});assert.equal(futureOccurrences(t,'2026-11-18','2026-11-30').length,0);});
test('forecast contains projected future salary but no actual posting',()=>{const s=blank();s.rules=[{id:'salary',type:'salary',day:23,title:'Зарплата',amount:3300000}];const rows=forecast(s,'2026-11-18',2);assert.ok(rows[0].available>balanceAt(s).available);assert.equal(s.transactions.length,0);});
test('validates demo data and rejects duplicate ids',()=>{const s=demo('2026-11-18');assert.equal(validateState(s),true);s.transactions.push({...s.transactions[0]});assert.throws(()=>validateState(s));});

test('backdated expense or transfer cannot make a later balance negative',()=>{
 const base={...blank(),opening:{available:10000,savings:0}};
 const spent=record(base,{kind:'expense',amount:9000,date:'2028-01-01'});
 for(const movement of [{kind:'expense'},{kind:'transfer',direction:'toSavings'}]){
  assert.throws(()=>record(spent,{...movement,amount:1001,date:'2027-12-31'}),/2028-01-01/);
  const exactlyEnough=record(spent,{...movement,amount:1000,date:'2027-12-31'});
  assert.equal(balanceAt(exactlyEnough).available,0);
 }
});

test('removing or moving a transfer cannot strand a later payment on its destination',()=>{
 const base={...blank(),accounts:[{id:'cash',name:'Cash',opening:0}]};
 const tx={id:'cash-in',kind:'transfer',fromAccount:'main',toAccount:'cash',amount:100,date:'2028-02-28'};
 const transferred=record(base,tx);
 const spent=record(transferred,{kind:'expense',accountId:'cash',amount:100,date:'2028-02-29'});
 assert.throws(()=>deleteTransaction(spent,tx.id),/Cash.*2028-02-29/);
 const edited={...spent,transactions:[spent.transactions.at(-1),{...tx,date:'2028-03-01'}]};
 assert.throws(()=>assertNoNewOverdraft(spent,edited),/Cash.*2028-02-29/);
});

test('existing statement overdrafts remain valid and can improve',()=>{
 const base={...blank(),opening:{available:0,savings:10000},openingDate:'2028-01-01'};
 const imported=record(base,{kind:'expense',amount:100,date:'2028-01-02'},{allowNegative:true});
 assert.equal(balanceAt(record(imported,{kind:'income',amount:50,date:'2028-01-01'})).available,-50);
 assert.throws(()=>record(imported,{kind:'expense',amount:1,date:'2028-01-02'}),/Недостаточно/);
 const historical=record(imported,{kind:'expense',amount:50,date:'2027-12-31',historical:true});
 assert.deepEqual(balanceAt(historical),balanceAt(imported));
});
