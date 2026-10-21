// Persist only form data. Never serialize an API response, session or credential.
const strings=['title','content','categoryId','industry','department','difficulty','implementationStatus','expectedOutcome','version','publicTitle','summary','rprompt','bprompt','rejectNotes','urgency','urgencyReason','valueAssessment'];
export type DraftData=Record<string,unknown>;
export function draftKey(userId:string,recordId:string){return `jack-case:draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(recordId)}`;}
export function sanitizeDraft(input:unknown):DraftData{
 const data=(input&&typeof input==='object'?input:{}) as DraftData;const result:DraftData={};
 for(const field of strings)if(typeof data[field]==='string')result[field]=data[field];
 if(data.coverId===null||typeof data.coverId==='string')result.coverId=data.coverId;
 if(typeof data.consent==='boolean')result.consent=data.consent;
 for(const field of ['tagIds','approved','applicableEntities','circulationTypes','businessModes','subdomains'])if(Array.isArray(data[field]))result[field]=(data[field] as unknown[]).filter((x):x is string=>typeof x==='string').slice(0,40);
 for(const field of ['materials','photos'])if(Array.isArray(data[field]))result[field]=(data[field] as unknown[]).filter(x=>x&&typeof x==='object'&&typeof (x as any).id==='string'&&typeof (x as any).url==='string'&&(field==='photos'||(['name','purpose','mimeType'].every(k=>typeof (x as any)[k]==='string')&&typeof (x as any).size==='number'&&Number.isFinite((x as any).size)&&(x as any).size>=0))).slice(0,10).map(x=>{const f=x as Record<string,unknown>;const out:DraftData={};for(const k of ['id','url','name','purpose','mimeType'])if(typeof f[k]==='string')out[k]=f[k];if(typeof f.size==='number')out.size=f.size;if(typeof f.approved==='boolean')out.approved=f.approved;return out;});
 return result;
}
export function readDraft(storage:Pick<Storage,'getItem'>,key:string){const raw=storage.getItem(key);if(!raw)return null;try{const value=JSON.parse(raw);return value?.schema===1&&value.data&&typeof value.data==='object'&&!Array.isArray(value.data)?sanitizeDraft(value.data):null;}catch{return null;}}
export function writeDraft(storage:Pick<Storage,'setItem'>,key:string,data:DraftData){storage.setItem(key,JSON.stringify({schema:1,data:sanitizeDraft(data)}));}
export function privatePayload(data:DraftData){return {...Object.fromEntries(['title','content','categoryId','industry','department','difficulty','implementationStatus','expectedOutcome','urgency','urgencyReason','valueAssessment'].filter(k=>typeof data[k]==='string').map(k=>[k,data[k]||null])),...Object.fromEntries(['tagIds','applicableEntities','circulationTypes','businessModes','subdomains'].filter(k=>Array.isArray(data[k])).map(k=>[k,data[k]])),fileIds:((data.materials??[]) as {id:string}[]).map(f=>f.id),mediaIds:((data.photos??[]) as {id:string}[]).map(f=>f.id),...(data.coverId!==undefined?{coverMediaId:data.coverId}:{})};}
export function publicationPayload(data:DraftData){return {decision:'approve',title:data.publicTitle,summary:data.summary,requirementPrompt:data.rprompt,buildPrompt:data.bprompt,approvedMediaIds:((data.photos??[]) as {id:string}[]).filter(f=>((data.approved??[]) as string[]).includes(f.id)).map(f=>f.id),approvedFileIds:((data.materials??[]) as {id:string;approved?:boolean}[]).filter(f=>f.approved).map(f=>f.id)};}
