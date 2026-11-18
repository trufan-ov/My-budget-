import test from 'node:test';
import assert from 'node:assert/strict';
import {repaymentSchedule} from '../src/debts.mjs';

test('zero-interest schedule repays every kopeck',()=>{
 const rows=repaymentSchedule({principal:10001,apr:0,months:3,startDate:'2026-12-18'});
 assert.equal(rows.length,3);
 assert.equal(rows.reduce((n,r)=>n+r.principal,0),10001);
 assert.equal(rows.at(-1).remaining,0);
 assert.ok(rows.every(r=>r.interest===0));
});
test('interest-bearing schedule pays off principal and keeps total consistent',()=>{
 const rows=repaymentSchedule({principal:12000000,apr:12,months:12,startDate:'2026-12-18'});
 assert.equal(rows.reduce((n,r)=>n+r.principal,0),12000000);
 assert.equal(rows.at(-1).remaining,0);
 assert.ok(rows.every(r=>r.amount===r.principal+r.interest));
 assert.ok(rows[0].interest>0);
});
test('month-end due dates clamp to valid dates',()=>{
 const rows=repaymentSchedule({principal:30000,apr:0,months:3,startDate:'2027-01-31'});
 assert.deepEqual(rows.map(r=>r.date),['2027-01-31','2027-02-28','2027-03-31']);
});
test('invalid amortization settings are rejected',()=>{
 assert.throws(()=>repaymentSchedule({principal:100,apr:0,months:0,startDate:'2026-12-18'}));
});

test('scheduled debt payment is matched to planned event without double counting',async()=>{
 const {addDebt,payDebt}=await import('../src/debts.mjs');
 const {pendingEvents}=await import('../src/finance.mjs');
 const state={openingDate:'2026-11-18',opening:{available:1000000,savings:0},accounts:[],transactions:[],rules:[],oneOffs:[],installments:[],goals:[],closedPlans:[],settings:{planning:{startDate:'2026-11-18'}}};
 let created=addDebt(state,{title:'Кредит',type:'borrowed',principal:300000,apr:0,dueDate:'2026-12-18'});
 const d=created.debts[0],schedule=repaymentSchedule({principal:300000,apr:0,months:3,startDate:'2026-12-18'});
 created={...created,debts:[{...d,schedule}]};
 const due=pendingEvents(created,'2026-11-18','2027-03-18').filter(e=>e.type==='debtSchedule');
 assert.equal(due.length,3);
 assert.equal(due.reduce((n,e)=>n+e.amount,0),300000);
 const paid=payDebt(created,d.id,{principal:due[0].principal,interest:due[0].interest,date:'2026-12-18',plannedId:due[0].id});
 assert.equal(pendingEvents(paid,'2026-11-18','2027-03-18').filter(e=>e.type==='debtSchedule').length,2);
});

test('credit card tracks available limit and grace expiration without fabricating interest',async()=>{
 const {creditCardStatus}=await import('../src/debts.mjs');
 const debt={id:'card',type:'creditCard',principal:80000,creditLimit:100000,graceUntil:'2026-12-01'};
 assert.deepEqual([creditCardStatus(debt,[],'2026-11-30').availableLimit,creditCardStatus(debt,[],'2026-11-30').graceStatus],[20000,'active']);
 assert.equal(creditCardStatus(debt,[],'2026-12-02').graceStatus,'expired');
 const tx=[{debtId:'card',principal:30000,interest:0}];
 assert.equal(creditCardStatus(debt,tx,'2026-12-02').availableLimit,50000);
 assert.equal(creditCardStatus(debt,tx,'2026-12-02').owed,50000);
});
test('card principal cannot exceed declared credit limit',async()=>{
 const {addDebt}=await import('../src/debts.mjs');
 assert.throws(()=>addDebt({debts:[]},{title:'Карта',type:'creditCard',principal:200000,creditLimit:100000}),/превышает/);
});

test('manual principal repayment reduces future scheduled payments and prevents duplicate reserve',async()=>{
 const {pendingEvents}=await import('../src/finance.mjs');
 const state={transactions:[{id:'manual',date:'2026-11-19',kind:'expense',amount:150000,principal:150000,interest:0,debtId:'loan'}],rules:[],oneOffs:[],debts:[{id:'loan',type:'borrowed',principal:300000,title:'Loan',schedule:[{date:'2026-12-01',principal:100000,interest:1000,amount:101000},{date:'2027-01-01',principal:100000,interest:1000,amount:101000},{date:'2027-02-01',principal:100000,interest:1000,amount:101000}]}]};
 const events=pendingEvents(state,'2026-11-20','2027-03-01').filter(e=>e.type==='debtSchedule');
 assert.equal(events.length,2);
 assert.deepEqual(events.map(e=>[e.principal,e.interest,e.remaining]),[[50000,1000,51000],[100000,1000,101000]]);
});
test('scheduled principal and interest already paid are not counted again',async()=>{
 const {pendingEvents}=await import('../src/finance.mjs');
 const state={transactions:[{id:'paid',kind:'expense',date:'2026-11-18',debtId:'loan',plannedId:'debt-schedule:loan:0',principal:40000,interest:500,amount:40500}],rules:[],oneOffs:[],debts:[{id:'loan',type:'borrowed',title:'Loan',principal:100000,schedule:[{date:'2026-12-01',principal:100000,interest:1000,amount:101000}]}]};
 const events=pendingEvents(state,'2026-11-20','2026-12-31');
 assert.deepEqual([events[0].principal,events[0].interest,events[0].remaining],[60000,500,60500]);
});
