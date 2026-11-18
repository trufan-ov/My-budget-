import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,record} from '../src/core.mjs';
import {personalDraft,applyPersonalDraft,pendingEvents,dailyPlan,financeForecast} from '../src/finance.mjs';
const blank=()=>({...demo('2026-11-18'),opening:{available:0,savings:0},transactions:[],rules:[],oneOffs:[],settings:{savingsApr:0}});
test('personal setup retains all ten installment payments',()=>{
 const s=applyPersonalDraft(blank());
 assert.equal(s.installments[0].payments.length,10);
 assert.equal(s.installments[0].payments.reduce((a,p)=>a+p.amount,0),7274135);
 assert.equal(s.opening.available,346200);
 assert.equal(s.opening.savings,750000);
});
test('partial payment leaves unpaid installment remainder in forecast',()=>{
 const s=applyPersonalDraft(blank());
 const id=s.installments[0].payments[0].id;
 const paid=record(s,{kind:'expense',date:'2026-12-18',amount:100000,plannedId:id});
 const events=pendingEvents(paid,'2026-12-18','2026-12-20');
 assert.equal(events.find(e=>e.id===id).remaining,1948371);
});
test('closing remainder removes it from pending obligations',()=>{
 const s=applyPersonalDraft(blank());
 const id=s.installments[0].payments[0].id;
 assert.equal(pendingEvents({...s,closedPlans:[id]},'2026-12-18','2026-12-20').some(e=>e.id===id),false);
});
test('goals reduce affordable daily spend before deadlines',()=>{
 const s=applyPersonalDraft(blank());
 const p=dailyPlan(s,'2026-11-18','2026-12-06');
 assert.ok(p.daily<=100000);
 assert.ok(p.pending.some(e=>e.id==='stag'));
 assert.ok(p.pending.some(e=>e.id==='wedding'));
});
test('long-range forecast includes installments',()=>{
 const s=applyPersonalDraft(blank());
 const base=financeForecast(s,'2026-11-18',3);
 const without=financeForecast({...s,installments:[]},'2026-11-18',3);
 assert.equal(base[0].available,without[0].available);
 assert.equal(base[1].available,without[1].available-2048371);
 assert.equal(base[2].available,without[2].available-3106413);
});

test('overdue installment remains reserved after its deadline',()=>{
 const state=applyPersonalDraft(blank());
 const overdue=pendingEvents(state,'2026-12-20','2026-12-31');
 const bill=overdue.find(e=>e.id==='installment-1-0');
 assert.ok(bill);
 assert.equal(bill.remaining,2048371);
 assert.equal(bill.date,'2026-12-20');
});
test('unconfirmed salary does not increase actual cash',()=>{
 const state=applyPersonalDraft(blank());
 assert.equal(dailyPlan(state,'2026-11-18','2026-11-22').maximumDaily,69240);
});
test('subscriptions without dates are not silently assigned a due date',()=>{
 const state=applyPersonalDraft(blank());
 assert.equal(state.undatedObligations.reduce((n,x)=>n+x.amount,0),330000);
 assert.ok(!pendingEvents(state,'2026-11-18','2026-11-22').some(x=>x.category==='Подписки'));
});

test('personal draft replaces default demo after explicit opt-in',()=>{
 const current=demo('2026-11-18');
 const applied=applyPersonalDraft(current,{replaceDemo:true});
 assert.equal(applied.transactions.length,0);
 assert.equal(applied.rules.length,2);
 assert.equal(applied.settings.demo,false);
 assert.equal(applied.opening.available,346200);
});
test('personal draft never silently replaces real operations',()=>{
 const current={...demo('2026-11-18'),settings:{savingsApr:0,demo:false}};
 assert.throws(()=>applyPersonalDraft(current,{replaceDemo:true}),/уже есть данные/);
});

test('historical bank operations do not change opening balances but same-day new transactions do',async()=>{
 const {balanceAt,record}=await import('../src/core.mjs');
 const initial=applyPersonalDraft(blank());
 const history={...initial,transactions:[{id:'old',kind:'expense',amount:100000,date:'2026-11-17',historical:true}]};
 assert.equal(balanceAt(history,'2026-11-18').available,346200);
 const actual=record(history,{kind:'expense',amount:20000,date:'2026-11-18'});
 assert.equal(balanceAt(actual,'2026-11-18').available,326200);
});
test('multiple accounts and transfers conserve net worth',async()=>{
 const {record,accountBalances,balanceAt}=await import('../src/core.mjs');
 const state={...blank(),opening:{available:1000000,savings:0},accounts:[{id:'cash',name:'Наличные',opening:50000,includeInDaily:true}]};
 const moved=record(state,{kind:'transfer',fromAccount:'main',toAccount:'cash',amount:100000,date:'2026-11-18'});
 assert.equal(accountBalances(moved).cash,150000);
 assert.equal(balanceAt(moved).total,balanceAt(state).total);
});
test('excluded account does not inflate safe daily budget',async()=>{
 const state={...applyPersonalDraft(blank()),accounts:[{id:'reserve',name:'Резерв',opening:5000000,includeInDaily:false}]};
 assert.equal(dailyPlan(state,'2026-11-18','2026-11-22').maximumDaily,69240);
});
test('debts support principal and interest split',async()=>{
 const {addDebt,payDebt,debtBalance,netWorth}=await import('../src/debts.mjs');
 const state={...blank(),opening:{available:1000000,savings:0}};
 const created=addDebt(state,{title:'Друг',type:'borrowed',principal:300000,apr:12});
 const paid=payDebt(created,created.debts[0].id,{principal:100000,interest:10000,date:'2026-11-18'});
 assert.equal(debtBalance(created.debts[0],paid.transactions).principal,200000);
 assert.equal(netWorth(paid,{main:890000,savings:0}),690000);
});

test('credit principal due is reserved and reduced after partial payment',async()=>{
 const {addDebt,payDebt}=await import('../src/debts.mjs');
 const state={...blank(),opening:{available:1000000,savings:0}};
 const added=addDebt(state,{title:'Кредит',type:'borrowed',principal:300000,apr:0,dueDate:'2026-11-25'});
 const before=pendingEvents(added,'2026-11-18','2026-11-30').find(e=>e.type==='debt');
 assert.equal(before.remaining,300000);
 const paid=payDebt(added,added.debts[0].id,{principal:100000,date:'2026-11-18'});
 assert.equal(pendingEvents(paid,'2026-11-18','2026-11-30').find(e=>e.type==='debt').remaining,200000);
});
test('recurring income is classified as income',async()=>{
 const {futureOccurrences}=await import('../src/core.mjs');
 const state={...blank(),rules:[{id:'rent',type:'income',title:'Доход',day:20,amount:100000}]};
 assert.equal(futureOccurrences(state,'2026-11-18','2026-11-30')[0].kind,'income');
});

test('planned savings transfer conserves projected net worth',()=>{
 const state={...blank(),opening:{available:1000000,savings:0},rules:[{id:'save',type:'savings',title:'В копилку',day:20,amount:100000}]};
 const projected=financeForecast(state,'2026-11-18',1);
 const noRule=financeForecast({...state,rules:[]},'2026-11-18',1);
 assert.equal(projected[0].available,noRule[0].available-100000);
 assert.ok(projected[0].savings>=noRule[0].savings+100000);
});

test('historical forecast refuses to silently invent spending when no expense history exists',()=>{
 const state={...blank(),transactions:[]};
 assert.throws(()=>financeForecast(state,'2026-11-18',3,'actual'),/Недостаточно фактических расходов/);
});
test('historical forecast uses observed expenses when available',()=>{
 const state={...blank(),transactions:[{id:'spent',kind:'expense',amount:30000,date:'2026-11-17',category:'Еда',note:''}],opening:{available:1000000,savings:0}};
 const rows=financeForecast(state,'2026-11-18',3,'actual');
 assert.equal(rows[0].daily,1000);
});

test('personal draft cannot overwrite real debts or extra accounts',async()=>{
 const {applyPersonalDraft}=await import('../src/finance.mjs');
 const {demo}=await import('../src/core.mjs');
 const blank={...demo('2026-11-18'),transactions:[],rules:[],oneOffs:[],settings:{savingsApr:0,demo:false}};
 assert.throws(()=>applyPersonalDraft({...blank,debts:[{id:'debt'}]}),/уже есть данные/);
 assert.throws(()=>applyPersonalDraft({...blank,accounts:[{id:'cash',opening:100}]}),/уже есть данные/);
 const initialized=applyPersonalDraft(blank);
 assert.equal(initialized.debts.length,0);
 assert.equal(initialized.accounts.length,0);
});

test('backup validation rejects malformed financial obligations and dangling debt references',async()=>{
 const {demo,validateState}=await import('../src/core.mjs');
 const base=demo('2026-11-18');
 const loan={id:'loan',type:'borrowed',principal:100000,apr:10,title:'Кредит',schedule:[{date:'2026-12-01',principal:99000,interest:1000,amount:100000}]};
 assert.equal(validateState({...base,debts:[loan]}),true);
 assert.throws(()=>validateState({...base,debts:[{...loan,schedule:[{...loan.schedule[0],amount:90000}]}]}),/кредиты/);
 assert.throws(()=>validateState({...base,goals:[{id:'goal',date:'2026-02-31',amount:5000}]}),/цели/);
 assert.throws(()=>validateState({...base,installments:[{id:'i',payments:[{id:'p',date:'2026-12-01',amount:-1}]}]}),/рассрочки/);
 assert.throws(()=>validateState({...base,transactions:[...base.transactions,{id:'debt-tx',kind:'expense',date:'2026-11-18',amount:100,debtId:'missing'}],debts:[loan]}),/отсутствующий долг/);
});

test('historical spending forecast excludes debt payments and pre-opening bank history',async()=>{
 const {financeForecast}=await import('../src/finance.mjs');
 const {demo}=await import('../src/core.mjs');
 const state={...demo('2026-11-18'),opening:{available:10000000,savings:0},rules:[],oneOffs:[],transactions:[
  {id:'food',kind:'expense',date:'2026-11-17',amount:30000,note:'Food'},
  {id:'debt',kind:'expense',date:'2026-11-16',amount:300000,debtId:'loan'},
  {id:'old',kind:'expense',date:'2026-11-15',amount:900000,historical:true}
 ],settings:{savingsApr:0,planning:{dailyTarget:100000}}};
 const rows=financeForecast(state,'2026-11-18',1,'actual');
 assert.equal(rows[0].daily,1000);
});

test('forecast never returns NaN rubles for invalid daily budget or economy settings',async()=>{
 const {financeForecast}=await import('../src/finance.mjs');
 const {demo}=await import('../src/core.mjs');
 const base=demo('2026-11-18');
 const invalid={...base,settings:{...base.settings,planning:{...base.settings?.planning,dailyTarget:'не число'}}};
 assert.throws(()=>financeForecast(invalid,'2026-11-18',3,'comfortable'),/дневной бюджет/);
 const invalidEconomy={...base,settings:{...base.settings,planning:{...base.settings?.planning,economyPercent:'не число'}}};
 assert.throws(()=>financeForecast(invalidEconomy,'2026-11-18',3,'economical'),/процент экономии/);
 const rows=financeForecast(base,'2026-11-18',3,'comfortable');
 assert.ok(rows.every(r=>[r.available,r.savings,r.total,r.interest,r.daily].every(Number.isFinite)));
});

test('forecast month boundaries are complete dates and produce numeric balances',()=>{
 const state=applyPersonalDraft(blank());
 for(const horizon of [3,6,12]){
  const rows=financeForecast(state,'2026-11-18',horizon);
  assert.equal(rows.length,horizon);
  assert.ok(rows.every(r=>[r.available,r.savings,r.total,r.interest,r.daily].every(Number.isSafeInteger)));
 }
});

test('historical daily spend ignores goals, credit payments and savings moves',()=>{
 const state={...blank(),opening:{available:10000000,savings:0},transactions:[
  {id:'food',kind:'expense',date:'2026-11-17',amount:30000,category:'Еда'},
  {id:'goal',kind:'expense',date:'2026-11-17',amount:600000,category:'Цель'},
  {id:'credit',kind:'expense',date:'2026-11-17',amount:700000,category:'Кредиты'},
  {id:'save',kind:'expense',date:'2026-11-17',amount:800000,category:'Копилка'}
 ]};
 assert.equal(financeForecast(state,'2026-11-18',1,'actual')[0].daily,1000);
});

test('overdue one-off obligations stay pending until paid or closed',()=>{
 const state={...blank(),opening:{available:500000,savings:0},oneOffs:[{id:'rent-old',title:'Просроченная аренда',kind:'expense',date:'2026-11-10',amount:200000}]};
 const overdue=pendingEvents(state,'2026-11-18','2026-11-30').find(e=>e.id==='rent-old');
 assert.equal(overdue.originalDate,'2026-11-10');
 assert.equal(overdue.date,'2026-11-18');
 assert.equal(overdue.remaining,200000);
 assert.equal(dailyPlan(state,'2026-11-18','2026-11-18').maximumDaily,300000);
 const partial={...state,transactions:[{id:'paid',kind:'expense',date:'2026-11-18',amount:50000,plannedId:'rent-old'}]};
 assert.equal(pendingEvents(partial,'2026-11-18','2026-11-30').find(e=>e.id==='rent-old').remaining,150000);
 assert.equal(pendingEvents({...state,closedPlans:['rent-old']},'2026-11-18','2026-11-30').some(e=>e.id==='rent-old'),false);
});

test('overdue unconfirmed one-off income is never credited as future cash',()=>{
 const state={...blank(),opening:{available:100000,savings:0},oneOffs:[{id:'late-bonus',title:'Не полученный бонус',kind:'income',date:'2026-11-10',amount:900000}]};
 assert.equal(pendingEvents(state,'2026-11-18','2026-11-30').some(e=>e.id==='late-bonus'),false);
 assert.equal(dailyPlan(state,'2026-11-18','2026-11-18').maximumDaily,100000);
});

test('forecast rejects invalid savings rates instead of silently crediting interest',()=>{
 for(const apr of [-1,101,'not-a-number']){
  const state={...blank(),settings:{...blank().settings,savingsApr:apr}};
  assert.throws(()=>financeForecast(state,'2026-11-18',3,'comfortable'),/ставка накоплений/i);
 }
});

test('already funded goal reserves only outstanding portion without altering cash',()=>{
 const base=applyPersonalDraft(blank());
 const funded={...base,goals:base.goals.map(g=>g.id==='stag'?{...g,funded:300000,fundedAccountId:'savings'}:g)};
 const original=pendingEvents(base,'2026-11-18','2026-12-06').find(e=>e.id==='stag');
 const reduced=pendingEvents(funded,'2026-11-18','2026-12-06').find(e=>e.id==='stag');
 assert.equal(original.remaining,500000);
 assert.equal(reduced.remaining,200000);
 assert.equal(dailyPlan(funded,'2026-11-18','2026-12-06').pending.find(e=>e.id==='stag').remaining,200000);
});
test('fully funded goals no longer reserve money a second time',()=>{
 const base=applyPersonalDraft(blank());
 const funded={...base,goals:base.goals.map(g=>g.id==='stag'?{...g,funded:g.amount,fundedAccountId:'savings'}:g)};
 assert.equal(pendingEvents(funded,'2026-11-18','2026-12-06').some(e=>e.id==='stag'),false);
});

test('two goals cannot reserve the same savings balance twice',async()=>{
 const {goalFundingStatus}=await import('../src/finance.mjs');
 const base={...applyPersonalDraft(blank()),opening:{available:0,savings:500000}};
 const state={...base,goals:[{id:'a',title:'A',date:'2026-12-01',amount:500000,funded:500000,fundedAccountId:'savings'},{id:'b',title:'B',date:'2026-12-02',amount:500000,funded:500000,fundedAccountId:'savings'}]};
 const funding=goalFundingStatus(state,'2026-11-18');
 assert.equal(funding[0].funded,500000);
 assert.equal(funding[1].funded,0);
 assert.equal(pendingEvents(state,'2026-11-18','2026-12-05').find(e=>e.id==='b').remaining,500000);
});
test('unlinked declared reserves do not count as funded cash',async()=>{
 const {goalFundingStatus}=await import('../src/finance.mjs');
 const base=applyPersonalDraft(blank());
 const state={...base,goals:base.goals.map(g=>({...g,funded:300000}))};
 assert.equal(goalFundingStatus(state,'2026-11-18')[0].funded,0);
});
