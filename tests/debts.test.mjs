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
