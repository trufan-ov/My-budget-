import {demo,validateState} from './core.mjs';
const DB='moy-budget-local-v1', STORE='state', KEY='main';
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function withStore(mode,op){const db=await openDB();return new Promise((resolve,reject)=>{const tr=db.transaction(STORE,mode);const req=op(tr.objectStore(STORE));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tr.oncomplete=()=>db.close();tr.onerror=()=>reject(tr.error);});}
export async function load(){const result=await withStore('readonly',s=>s.get(KEY));if(result){validateState(result);return result;}const seed=demo();await save(seed);return seed;}
export async function save(state){validateState(state);await withStore('readwrite',s=>s.put(state,KEY));}
export function downloadBackup(state){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`moy-budget-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export async function readBackup(file){const text=await file.text();const data=JSON.parse(text);if(data.schemaVersion!==1)throw Error('Неподдерживаемая версия резервной копии');validateState(data);return data;}
