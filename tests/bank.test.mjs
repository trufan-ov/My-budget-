import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRows,bankMoney,parseBankCSV,unmatchedStatementRows} from '../src/bank.mjs';
test('CSV parses quoted delimiters and embedded line breaks',()=>{
 assert.deepEqual(csvRows('Дата;Сумма;Описание\n2026-11-18;-10,50;"Кафе; чек\nс комментарием"'),[['Дата','Сумма','Описание'],['2026-11-18','-10,50','Кафе; чек\nс комментарием']]);
});
test('bank statements with separated debit and credit columns',()=>{
 const rows=parseBankCSV('Дата;Списание;Зачисление;Описание\n18.11.2026;1 234,56;;Продукты\n19.11.2026;;33 000,00;Зарплата');
 assert.deepEqual(rows.map(x=>[x.kind,x.amount]),[['expense',123456],['income',3300000]]);
});
test('monetary values parse with decimal and thousands separators',()=>{
 assert.equal(bankMoney('1 234,50 ₽'),123450);
 assert.equal(bankMoney('1.234,50'),123450);
 assert.equal(bankMoney('1,234.50'),123450);
});
test('identical legitimate operations are preserved but reimports are idempotent',()=>{
 const tx={kind:'expense',date:'2026-11-18',amount:10000,note:'Кофе'};
 const first=unmatchedStatementRows([tx,tx],[]);
 assert.equal(first.length,2);
 assert.equal(unmatchedStatementRows([tx,tx],first).length,0);
 assert.equal(unmatchedStatementRows([tx,tx,tx],first).length,1);
});
test('skip classification is excluded from bank import',()=>{
 const tx={kind:'skip',date:'2026-11-18',amount:10000,note:'Внутренний перевод'};
 assert.equal(unmatchedStatementRows([tx],[]).length,0);
});
test('invalid calendar dates and zero amounts are excluded',()=>{
 assert.throws(()=>parseBankCSV('Дата;Сумма;Описание\n31.02.2026;-10;bad\n19.11.2026;0;zero'));
});
