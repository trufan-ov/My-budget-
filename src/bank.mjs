import {assertNoNewOverdraft} from './core.mjs';

// Bank statement parser. No network access or third-party dependencies.
export function csvRows(input,separator){
 const text=String(input).replace(/^\uFEFF/,'');
 if(!separator){const header=text.split(/\r?\n/,1)[0];const counts=[[';',(header.match(/;/g)||[]).length],[',',(header.match(/,/g)||[]).length],['\t',(header.match(/\t/g)||[]).length]];separator=counts.sort((a,b)=>b[1]-a[1])[0][0];}
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){field+='"';i++;}
   else quoted=!quoted;
  }else if(c===separator&&!quoted){row.push(field.trim());field='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw Error('Незакрытая кавычка в CSV');
 row.push(field.trim());if(row.some(Boolean))rows.push(row);
 return rows;
}
const BANK_NUMBER_FORMATS=[
 /^(\d+)(?:[.,](\d{1,2}))?$/,
 /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/,
 /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/,
 /^(\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,](\d{1,2}))?$/,
];
const stripRubleSuffix=value=>value.replace(/\s*(?:₽|руб\.?|RUB)$/i,'').trim();

export function bankMoney(value){
 let raw=stripRubleSuffix(String(value??'').trim());
 const accounting=raw.startsWith('(')&&raw.endsWith(')');
 if(accounting)raw=stripRubleSuffix(raw.slice(1,-1).trim());

 const sign=raw.match(/^[+\-−]/)?.[0];
 if(accounting&&sign)return NaN;
 if(sign)raw=raw.slice(1).trimStart();
 const negative=accounting||sign==='-'||sign==='−';

 for(const format of BANK_NUMBER_FORMATS){
  const match=raw.match(format);
  if(!match)continue;
  const [,rubles,kopecks='']=match;
  // A single separator followed by three digits is ambiguous in a statement.
  if(!kopecks&&/^\d{1,3}[.,]\d{3}$/.test(rubles))continue;
  const amount=Number(rubles.replace(/\D/g,'')+kopecks.padEnd(2,'0'));
  return Number.isSafeInteger(amount)?(negative?-amount:amount):NaN;
 }
 return NaN;
}
export function parseBankStatement(text){
 const rows=csvRows(text);if(rows.length<2)throw Error('CSV не содержит операций');
 const headers=rows.shift().map(x=>x.toLowerCase().replace(/ё/g,'е'));
 const col=terms=>headers.findIndex(h=>terms.some(t=>h.includes(t)));
 const dateCol=col(['дата','date','день операции']),amountCol=col(['сумма','amount']),debitCol=col(['списание','расход','debit']),creditCol=col(['зачисление','приход','credit']),noteCol=col(['описание','назначение','операция','description','merchant']);
 if(dateCol<0||(amountCol<0&&(debitCol<0||creditCol<0)))throw Error('Не найдены столбцы даты и суммы (либо списания и зачисления)');
 const parsed=[];
 for(const cells of rows){
  let cents;
  if(amountCol>=0&&!(debitCol>=0&&creditCol>=0))cents=bankMoney(cells[amountCol]);
  else {const debit=bankMoney(cells[debitCol]||'0'),credit=bankMoney(cells[creditCol]||'0');if(!Number.isSafeInteger(debit)||!Number.isSafeInteger(credit)||debit!==0&&credit!==0)continue;cents=Math.abs(credit)-Math.abs(debit);}
  if(!Number.isSafeInteger(cents)||cents===0)continue;
  const raw=(cells[dateCol]||'').trim().split(/[ T]/)[0];let date=raw;
  if(/^\d{2}[./]\d{2}[./]\d{4}$/.test(raw)){const [day,month,year]=raw.split(/[./]/);date=`${year}-${month}-${day}`;}
  else if(/^\d{4}\/\d{2}\/\d{2}$/.test(raw))date=raw.replace(/\//g,'-');
  const d=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==date)continue;
  parsed.push({kind:cents>0?'income':'expense',date,amount:Math.abs(cents),category:'Банк · без категории',note:(noteCol>=0?cells[noteCol]:'')||'Банковская операция'});
 }
 if(!parsed.length)throw Error('Нет подходящих строк. Проверьте формат выписки');
 return {transactions:parsed,rejectedRows:rows.length-parsed.length};
}

export function parseBankCSV(text){
 return parseBankStatement(text).transactions;
}
export function unmatchedStatementRows(preview,existing){
 const fingerprint=t=>[t.accountId||'main',t.date,t.kind,t.amount,(t.note||'').trim().toLowerCase()].join('|');
 const counts=new Map(),seen=new Map();
 for(const t of existing){const key=fingerprint(t);counts.set(key,(counts.get(key)||0)+1);}
 return preview.filter(t=>{
  if(t.kind==='skip')return false;
  const key=fingerprint(t),number=(seen.get(key)||0)+1;seen.set(key,number);
  return number>(counts.get(key)||0);
 });
}

export function bankImportSnapshot(tx){
 return JSON.stringify([tx.id,tx.date,tx.kind,tx.amount,tx.accountId||'main',tx.note||'',tx.category||'',!!tx.historical,tx.plannedId||null,tx.debtId||null]);
}
export function safeImportUndo(state,batch){
 if(!batch||!Array.isArray(batch.ids))throw Error('Не найдена партия импорта');
 const ids=new Set(batch.ids);
 const current=state.transactions.filter(t=>ids.has(t.id));
 if(current.length!==ids.size)throw Error('Часть импортированных операций уже удалена. Отмена всей партии небезопасна');
 if(!Array.isArray(batch.snapshots)||batch.snapshots.length!==current.length)throw Error('Для старой партии нет снимков операций. Автоматическая отмена небезопасна');
 const original=new Set(batch.snapshots);
 if(current.some(t=>!original.has(bankImportSnapshot(t))))throw Error('Импортированные операции были изменены. Отмена всей партии заблокирована');
 if(state.transactions.some(t=>t.groupId&&ids.has(t.groupId)))throw Error('Есть связанные операции. Сначала проверьте их вручную');
 const next={...state,transactions:state.transactions.filter(t=>!ids.has(t.id)),importBatches:(state.importBatches||[]).filter(b=>b.id!==batch.id)};
 assertNoNewOverdraft(state,next);
 return next;
}
