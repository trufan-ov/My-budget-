import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',async dialog=>dialog.accept());
try{
 await page.goto('http://localhost:4173/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.mobile-nav button').count(),4);
 const week=page.getByRole('button',{name:'7 дн.',exact:true});
 await week.click();
 assert.equal(await week.getAttribute('aria-pressed'),'true');
 await page.locator('.balance-plot svg').waitFor();
 const graph=page.getByRole('slider',{name:'Остаток по дате'});
 const latest=await graph.getAttribute('aria-valuetext');
 await graph.press('Home');
 assert.notEqual(await graph.getAttribute('aria-valuetext'),latest);
 await graph.press('End');
 assert.equal(await graph.getAttribute('aria-valuetext'),latest);
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 assert.equal(await page.evaluate(async()=>Boolean(await caches.match('/index.html'))),true);
 if(process.env.BROWSER!=='webkit'){
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.mobile-nav').waitFor();
  await context.setOffline(false);
 }
 await page.locator('.mobile-nav [data-nav="more"]').click();
 assert.equal(await page.locator('.more-link').count(),4);
 await page.locator('.more-link[data-nav="settings"]').click();
 await page.locator('[data-personal-seed]').click();
 await page.locator('[data-nav="plan"]:visible').first().click();
 await page.getByText('Мальчишник',{exact:true}).first().waitFor();
 await page.getByText('Свадьба Матвея',{exact:true}).first().waitFor();
 assert.equal(await page.locator('[data-plan-pay]').count(),12);
 await page.locator('.mobile-nav [data-nav="more"]').click();
 await page.locator('.more-link[data-nav="forecast"]').click();
 await page.getByText('Прогноз по месяцам',{exact:true}).first().waitFor();
 assert.equal(await page.getByText(/NaN|не число/i).count(),0);
 await page.locator('[data-scenario="actual"]').click();
 assert.equal(await page.getByText(/NaN|не число/i).count(),0);
 if(await page.locator('[data-scenario="comfortable"]').count()===1)await page.locator('[data-scenario="comfortable"]').click();
 for(const choice of ['economical','comfortable']){
  await page.locator('[data-scenario="'+choice+'"]').click();
  assert.equal(await page.getByText(/NaN|не число/i).count(),0);
 }
 await page.locator('.mobile-nav [data-nav="more"]').click();
 await page.locator('.more-link[data-nav="settings"]').click();
 await page.getByText('ChatGPT',{exact:true}).first().waitFor();
 await page.reload({waitUntil:'networkidle'});
 await page.locator('[data-nav="plan"]:visible').first().click();
 await page.getByText('Мальчишник',{exact:true}).first().waitFor();
 await page.locator('.mobile-nav [data-nav="more"]').click();
 await page.locator('.more-link[data-nav="accounts"]').click();
 await page.locator('[data-account-toggle="savings"]').click();
 await page.getByText('Учитывать в дневном бюджете',{exact:true}).first().waitFor();
 await page.locator('[data-modal="account"]').click();
 await page.locator('[name="title"]').fill('Наличные');
 await page.locator('[name="opening"]').fill('500');
 await page.locator('form[data-form="account"] button[type="submit"]').click();
 await page.getByText('Наличные',{exact:true}).first().waitFor();
 await page.locator('.mobile-nav [data-nav="more"]').click();
 await page.locator('.more-link[data-nav="debts"]').click();
 await page.locator('[data-modal="debt"]').click();
 await page.locator('[name="title"]').fill('Тестовый долг');
 await page.locator('[name="principal"]').fill('1000');
 await page.locator('form[data-form="debt"] button[type="submit"]').click();
 await page.getByText('Тестовый долг',{exact:true}).first().waitFor();
 await page.locator('.mobile-nav [data-nav="more"]').click();
 await page.locator('.more-link[data-nav="settings"]').click();
 const statement={name:'statement.csv',mimeType:'text/csv',buffer:Buffer.from('Дата;Сумма;Описание\n19.11.2026;(50,01);Тестовая покупка\n19.11.2026;15 USD;Другая валюта\n')};
 await page.locator('#bank-csv').setInputFiles(statement);
 await page.getByText(/Строк с некорректной датой или суммой: 1/).waitFor();
 await page.locator('#bank-csv').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('Некорректный файл')});
 await page.getByText('CSV не содержит операций',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-import-confirm]').count(),0);
 await page.locator('#bank-csv').setInputFiles(statement);
 await page.getByText('Тестовая покупка',{exact:true}).first().waitFor();
 assert.equal(await page.locator('[data-bank-page]').count(),2);
 await page.locator('[data-import-confirm]').click();
 await page.getByText('statement.csv',{exact:true}).first().waitFor();
 const imported=await page.evaluate(async()=>{
  const {load}=await import('/src/storage.mjs');
  const tx=(await load()).transactions.find(tx=>tx.note==='Тестовая покупка');
  return [tx.kind,tx.amount];
 });
 assert.deepEqual(imported,['expense',5001]);
 await page.locator('[data-import-undo]').click();
 await page.getByText('Импортов пока нет',{exact:true}).first().waitFor();
 const stalePage=await page.context().newPage();
 await stalePage.goto(page.url());
 const openAccounts=async tab=>{
  await tab.locator('.mobile-nav [data-nav="more"]').click();
  await tab.locator('.more-link[data-nav="accounts"]').click();
 };
 const createAccount=async (tab,name)=>{
  await tab.locator('[data-modal="account"]').click();
  await tab.locator('[name="title"]').fill(name);
  await tab.locator('form[data-form="account"] button[type="submit"]').click();
 };
 await openAccounts(stalePage);
 await openAccounts(page);
 await createAccount(page,'Сохранённый счёт');
 await page.getByText('Сохранённый счёт',{exact:true}).waitFor();
 await createAccount(stalePage,'Устаревшая вкладка');
 await stalePage.getByText(/Бюджет уже изменился/).waitFor();
 assert.equal(await stalePage.locator('[name="title"]').inputValue(),'Устаревшая вкладка');
 await stalePage.reload();
 await openAccounts(stalePage);
 await stalePage.getByText('Сохранённый счёт',{exact:true}).waitFor();
 assert.equal(await stalePage.getByText('Устаревшая вкладка',{exact:true}).count(),0);
 await stalePage.close();
 const afterRestore=await page.evaluate(async()=>{
  const {load,readBackup,save}=await import('/src/storage.mjs');
  const stored=await load();
  const backup=await readBackup(new Blob([JSON.stringify(stored)]));
  await save(backup,stored);
  let aborted=false;
  try{await save({...backup,uncloneable:()=>{}},backup);}catch(error){aborted=error.name==='DataCloneError';}
  if(!aborted)throw new Error('Expected a failed IndexedDB write');
  return {stored,restored:await load()};
 });
 assert.deepEqual(afterRestore.restored,afterRestore.stored);
 await page.reload();
 await page.locator('.mobile-nav [data-nav="plan"]').click();
 await page.locator('[data-modal="rule"]').click();
 await page.locator('[name="title"]').fill('Тестовое правило');
 await page.locator('[name="amount"]').fill('200');
 await page.locator('form[data-form="rule"] button[type="submit"]').click();
 await page.locator('[data-rule-edit]').click();
 await page.locator('[name="amount"]').fill('250');
 await page.locator('form[data-form^="ruleedit:"] button[type="submit"]').click();
 await page.getByText(/изменение с /).waitFor();
 const revision=await page.evaluate(async()=>{
  const {load}=await import('/src/storage.mjs');
  return (await load()).rules.find(x=>x.title==='Тестовое правило').revisions[0];
 });
 assert.equal(revision.amount,25000);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(async()=>{
  const {load,save}=await import('/src/storage.mjs');
  const {dateISO,addDays}=await import('/src/core.mjs');
  const old=await load(),today=dateISO();
  await save({...old,openingDate:today,opening:{available:100000,savings:10000},rules:[],oneOffs:[{id:'partial-bill',title:'Проверочный счёт',kind:'expense',amount:5000,date:today}],
   goals:[{id:'historical-goal',title:'Цель с архивной операцией',date:addDays(today,2),amount:50000}],
   transactions:[{id:'archived-payment',plannedId:'historical-goal',date:addDays(today,-1),kind:'expense',amount:20000,historical:true}],
  },old);
 });
 await page.reload();
 await page.locator('.mobile-nav [data-nav="plan"]').click();
 await page.locator('[data-plan-pay="historical-goal"]').click();
 const goalForm=page.locator('form[data-form="planpay:historical-goal"]');
 assert.equal(await goalForm.locator('[name="amount"]').inputValue(),'500');
 await goalForm.locator('button[type="submit"]').click();
 await page.getByText(/Цель оплачена/).waitFor();
 const billButton=page.locator('[data-modal="planpay:partial-bill"]');
 await billButton.click();
 const billForm=page.locator('form[data-form="planpay:partial-bill"]');
 await billForm.locator('[name="amount"]').fill('12.34');
 await billForm.locator('[name="accountId"]').selectOption('savings');
 await billForm.locator('button[type="submit"]').click();
 await billForm.waitFor({state:'detached'});
 await billButton.click();
 assert.equal(await billForm.locator('[name="amount"]').inputValue(),'37.66');
 const payment=await page.evaluate(async()=>{
  const {load}=await import('/src/storage.mjs');
  return (await load()).transactions.find(tx=>tx.plannedId==='partial-bill');
 });
 assert.deepEqual([payment.amount,payment.accountId],[1234,'savings']);
 assert.deepEqual(errors,[]);
 console.log('PASS: iPhone-size personal draft click, goals, 10 installments, subscriptions, persistence, concurrent edits, backup round-trip, write rollback, service worker cache, no JS errors');
}finally{await browser.close();}
