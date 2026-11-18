// XLSX reader for simple bank exports. No external network dependency.
const decode=new TextDecoder('utf-8');
function zipEntries(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=[];
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Некорректный XLSX (ZIP)');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
 if(count>10000||offset>=bytes.length)throw Error('Некорректный или слишком большой XLSX');
 let p=offset;
 for(let i=0;i<count;i++){
  if(view.getUint32(p,true)!==0x02014b50)throw Error('Ошибка структуры XLSX');
  const method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
  if(p+46+nameLen+extra+comment>bytes.length||local>=bytes.length||size>25_000_000)throw Error('Некорректный или слишком большой XLSX');
  const name=decode.decode(bytes.subarray(p+46,p+46+nameLen));
  out.push({name,method,size,local});p+=46+nameLen+extra+comment;
 }
 return out;
}
async function unzip(bytes,entry){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),p=entry.local;
 if(view.getUint32(p,true)!==0x04034b50)throw Error('Ошибка ZIP');
 const start=p+30+view.getUint16(p+26,true)+view.getUint16(p+28,true);
 const data=bytes.subarray(start,start+entry.size);
 if(entry.method===0)return decode.decode(data);
 if(entry.method!==8)throw Error('Неподдерживаемое сжатие XLSX');
 if(typeof DecompressionStream==='undefined')throw Error('Распаковка XLSX недоступна в этом браузере. Экспортируйте выписку в CSV');
 try{
  const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return decode.decode(await new Response(stream).arrayBuffer());
 }catch(err){throw Error('Не удалось распаковать XLSX в этом браузере. Попробуйте CSV: '+(err?.message||'ошибка распаковки'));}

}
const xml=s=>{const doc=new DOMParser().parseFromString(s,'application/xml');if(doc.querySelector('parsererror'))throw Error('Ошибка XML в XLSX');return doc;};
const nodes=(el,name)=>Array.from(el.getElementsByTagName(name));
export async function readXlsx(file){
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length>25_000_000)throw Error('Файл XLSX слишком большой');
 const entries=zipEntries(bytes),read=async name=>{const e=entries.find(e=>e.name===name);return e?xml(await unzip(bytes,e)):null;};
 const strings=await read('xl/sharedStrings.xml');
 const shared=strings?nodes(strings,'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
 const book=await read('xl/workbook.xml');
 const date1904=book?.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904')==='1';
 const sheet=entries.find(e=>/^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
 if(!sheet)throw Error('В XLSX не найден лист с данными');
 const doc=xml(await unzip(bytes,sheet));
 const result=[];
 for(const row of nodes(doc,'row')){
  const cols=[];
  for(const c of nodes(row,'c')){
   const ref=c.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/)?.[0]||'A';
   let index=0;for(const ch of letters)index=index*26+ch.charCodeAt(0)-64;index--;
   const type=c.getAttribute('t'),v=nodes(c,'v')[0]?.textContent||'';
   cols[index]=type==='s'?shared[Number(v)]??'':type==='inlineStr'?nodes(c,'t').map(t=>t.textContent).join(''):v;
   const style=c.getAttribute('s');
   if(type!=='s'&&type!=='inlineStr'&&style&&/^\d+(\.\d+)?$/.test(v)&&/^[A-Z]+$/.test(letters))cols[index]=v;
  }
  result.push(cols.map(x=>x??''));
 }
 if(!result.length)throw Error('Пустой XLSX');
 return {rows:result,date1904};
}
export function excelDate(value,date1904=false){
 const n=Number(value);if(!Number.isFinite(n)||n<1||n>100000)return String(value);
 const epoch=Date.UTC(1899,11,30)+(date1904?1462:0)*86400000;
 return new Date(epoch+Math.floor(n)*86400000).toISOString().slice(0,10);
}
