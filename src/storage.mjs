import {demo,uid,validateState} from './core.mjs';
const DB='moy-budget-local-v1', STORE='state', KEY='main', REVISION='revision';
const revisions=new WeakMap();

function openDB(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}

async function withStore(mode,run){
 const db=await openDB();
 try{
  return await new Promise((resolve,reject)=>{
   const transaction=db.transaction(STORE,mode);
   let result;
   let failure;
   transaction.oncomplete=()=>resolve(result);
   transaction.onabort=()=>reject(failure||transaction.error||Error('Сохранение прервано'));
   const abort=error=>{
    failure=error;
    transaction.abort();
   };
   try{
    run(transaction.objectStore(STORE),value=>{result=value;},abort);
   }catch(error){
    abort(error);
   }
  });
 }finally{
  db.close();
 }
}

export async function load(){
 // Use one transaction so that simultaneous first launches share one seed.
 const {state,revision}=await withStore('readwrite',(store,done,abort)=>{
  const current=store.get(KEY);
  const storedRevision=store.get(REVISION);
  storedRevision.onsuccess=()=>{
   try{
    if(current.result){
     validateState(current.result);
     done({state:current.result,revision:storedRevision.result});
    }else{
     const state=demo(),revision=uid();
     validateState(state);
     store.put(state,KEY);
     store.put(revision,REVISION);
     done({state,revision});
    }
   }catch(error){
    abort(error);
   }
  };
 });
 revisions.set(state,revision);
 return state;
}

export async function save(state,previous){
 validateState(state);
 if(!previous||!revisions.has(previous))throw Error('Обновите страницу перед сохранением бюджета');
 const expected=revisions.get(previous);
 const revision=uid();
 await withStore('readwrite',(store,done,abort)=>{
  const request=store.get(REVISION);
  request.onsuccess=()=>{
   if(request.result!==expected){
    abort(Error('Бюджет уже изменился. Обновите страницу и повторите действие.'));
    return;
   }
   try{
    store.put(state,KEY);
    store.put(revision,REVISION);
   }catch(error){
    abort(error);
   }
  };
 });
 revisions.set(state,revision);
}
export function downloadBackup(state){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`moy-budget-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export async function readBackup(file){const text=await file.text();const data=JSON.parse(text);if(data.schemaVersion!==1)throw Error('Неподдерживаемая версия резервной копии');validateState(data);return data;}
