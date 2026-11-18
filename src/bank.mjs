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
export function bankMoney(value){
 let s=String(value??'').replace(/[\s\u00a0₽]/g,'').replace(/руб\.?/gi,'').replace(/[^0-9,.-]/g,'');
 if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else s=s.replace(',','.');
 const n=Number(s);return Number.isFinite(n)?Math.round(n*100):NaN;
}
export function parseBankCSV(text){
 const rows=csvRows(text);if(rows.length<2)throw Error('CSV не содержит операций');
 const headers=rows.shift().map(x=>x.toLowerCase().replace(/ё/g,'е'));
 const col=terms=>headers.findIndex(h=>terms.some(t=>h.includes(t)));
 const dateCol=col(['дата','date','день операции']),amountCol=col(['сумма','amount']),debitCol=col(['списание','расход','debit']),creditCol=col(['зачисление','приход','credit']),noteCol=col(['описание','назначение','операция','description','merchant']);
 if(dateCol<0||(amountCol<0&&(debitCol<0||creditCol<0)))throw Error('Не найдены столбцы даты и суммы (либо списания и зачисления)');
 const parsed=[];
 for(const cells of rows){
  let cents;
  if(amountCol>=0&&!(debitCol>=0&&creditCol>=0))cents=bankMoney(cells[amountCol]);
  else {const debit=bankMoney(cells[debitCol]||'0'),credit=bankMoney(cells[creditCol]||'0');cents=credit-debit;}
  if(!Number.isSafeInteger(cents)||cents===0)continue;
  const raw=(cells[dateCol]||'').trim().split(/[ T]/)[0];let date=raw;
  if(/^\d{2}[./]\d{2}[./]\d{4}$/.test(raw)){const [day,month,year]=raw.split(/[./]/);date=`${year}-${month}-${day}`;}
  else if(/^\d{4}\/\d{2}\/\d{2}$/.test(raw))date=raw.replace(/\//g,'-');
  const d=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==date)continue;
  parsed.push({kind:cents>0?'income':'expense',date,amount:Math.abs(cents),category:'Банк · без категории',note:(noteCol>=0?cells[noteCol]:'')||'Банковская операция'});
 }
 if(!parsed.length)throw Error('Нет подходящих строк. Проверьте формат выписки');
 return parsed;
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
 return {...state,transactions:state.transactions.filter(t=>!ids.has(t.id)),importBatches:(state.importBatches||[]).filter(b=>b.id!==batch.id)};
}
