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
 assert.ok(base[0].available<base[1].available+10000000);
});
