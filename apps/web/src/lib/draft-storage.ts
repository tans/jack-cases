// Persist only form data. Never serialize an API response, session or credential.
const strings=['title','content','categoryId','industry','department','difficulty','implementationStatus','expectedOutcome','version','publicTitle','summary','rprompt','bprompt','rejectNotes'];
export type DraftData=Record<string,unknown>;
export function draftKey(userId:string,recordId:string){return `jack-case:draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(recordId)}`;}
export function sanitizeDraft(input:unknown):DraftData{
 const data=(input&&typeof input==='object'?input:{}) as DraftData;const result:DraftData={};
 for(const field of strings)if(typeof data[field]==='string')result[field]=data[field];
 if(data.coverId===null||typeof data.coverId==='string')result.coverId=data.coverId;
 for(const field of ['tagIds'])if(Array.isArray(data[field]))result[field]=(data[field] as unknown[]).filter((x):x is string=>typeof x==='string').slice(0,12);
 for(const field of ['materials','photos'])if(Array.isArray(data[field]))result[field]=(data[field] as unknown[]).filter(x=>x&&typeof x==='object'&&typeof (x as any).id==='string'&&typeof (x as any).url==='string'&&(field==='photos'||(['name','purpose','mimeType'].every(k=>typeof (x as any)[k]==='string')&&typeof (x as any).size==='number'&&Number.isFinite((x as any).size)&&(x as any).size>=0))).slice(0,10).map(x=>{const f=x as Record<string,unknown>;const out:DraftData={};for(const k of ['id','url','name','purpose','mimeType'])if(typeof f[k]==='string')out[k]=f[k];if(typeof f.size==='number')out.size=f.size;if(typeof f.approved==='boolean')out.approved=f.approved;return out;});
 return result;
}
export function readDraft(storage:Pick<Storage,'getItem'>,key:string){const raw=storage.getItem(key);if(!raw)return null;try{const value=JSON.parse(raw);return value?.schema===1&&value.data&&typeof value.data==='object'&&!Array.isArray(value.data)?sanitizeDraft(value.data):null;}catch{return null;}}
export function writeDraft(storage:Pick<Storage,'setItem'>,key:string,data:DraftData){storage.setItem(key,JSON.stringify({schema:1,data:sanitizeDraft(data)}));}
export function privatePayload(data:DraftData){return {...Object.fromEntries(['title','content','categoryId','industry','department','difficulty','implementationStatus','expectedOutcome'].filter(k=>typeof data[k]==='string').map(k=>[k,data[k]||null])),fileIds:((data.materials??[]) as {id:string}[]).map(f=>f.id),mediaIds:((data.photos??[]) as {id:string}[]).map(f=>f.id),...(data.coverId!==undefined?{coverMediaId:data.coverId}:{})};}
