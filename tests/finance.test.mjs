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
