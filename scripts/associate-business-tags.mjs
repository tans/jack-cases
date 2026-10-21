// Explicitly scoped operation for the five reference requirements, never a bulk backfill.
// Credentials stay in process memory; backups and reports contain records, never headers.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.REQUIREMENTS_API_BASE?.replace(/\/$/,'');
if(!base||!/^https?:\/\//.test(base))throw Error('Set REQUIREMENTS_API_BASE to the verified target API URL');
const cookie=process.env.PLATFORM_SESSION_COOKIE,ownerKey=process.env.REQUIREMENTS_API_KEY,taxKey=process.env.TAXONOMY_API_KEY;
if(!cookie&&(!ownerKey||!taxKey))throw Error('Need an authorized admin session cookie, or owner requirement key plus separate taxonomy write key; never elevate a read-only key');
const apply=process.argv.includes('--apply');
const target=[
 ['MED-REQ-0498','骨科耗材术前备货信息核对与参考清单','术前备货','preoperative-preparation'],
 ['MED-REQ-0507','骨科耗材销售拜访对话练习与复盘','销售训练','sales-training'],
 ['MED-REQ-0508','骨科销售访前公开学术资料收集与核验','客户研究','customer-research'],
 ['MED-REQ-0509','骨科耗材区域销售动作与医院项目进展跟踪',null,null],
 ['MED-REQ-0510','医疗器械企业批量文件用印与操作追溯','用印管理','seal-management'],
];
async function call(route,body,method=body?'POST':'GET',taxonomy=false){
 const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{Authorization:'Bearer '+(taxonomy?taxKey:ownerKey)}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Error(`${method} ${route}: HTTP ${response.status} ${result.error??''}`);return result;
}
const records=[];
for(let page=1;;page++){
 const r=await call('/requirements?'+new URLSearchParams({...(cookie?{scope:'all'}:{}),page:String(page),pageSize:'100'}));
 if(!Array.isArray(r.items))throw Error('Expected paginated requirement response');
 records.push(...r.items.filter(r=>target.some(t=>t[0]===r.requirementCode)));
 if(page>=r.totalPages||r.items.length<100)break;
}
assert.equal(records.length,5,'Must locate exactly the five target records before any writes');
const details=[];
for(const [code,title] of target){const matches=records.filter(r=>r.requirementCode===code);assert.equal(matches.length,1,code);assert.equal(matches[0].title,title,code+' title mismatch');details.push(await call('/requirements/'+matches[0].id));}
const allTags=await call('/tags?scope=all',undefined,'GET',true);
const dir=path.resolve(process.env.BUSINESS_TAG_BACKUP_DIR??'storage/business-tag-operation',new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(dir,{recursive:true,mode:0o700});
const save=(name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
save('before.json',{environment:base,requirements:details,tags:allTags});
console.log(JSON.stringify({environment:base,apply,backup:dir,targets:details.map(r=>({id:r.id,code:r.requirementCode,title:r.title,tags:r.tags.map(t=>t.name)})),availableTags:allTags.map(t=>({id:t.id,name:t.name,active:t.active}))}));
if(!apply){console.log('Read-only preflight complete. Review existing names/synonyms before --apply.');process.exit(0);}
const report=[];
for(const [code,,name,slug] of target){
 const before=details.find(r=>r.requirementCode===code);
 if(!name){assert.ok(['任务跟进','跨部门协同'].every(name=>before.tags.some(t=>t.name===name)),'0509 must already retain its two existing tags');report.push({code,unchanged:true,tags:before.tags.map(t=>t.name)});continue;}
 let tag=allTags.find(t=>t.name===name);if(!tag){if(allTags.some(t=>t.slug===slug))throw Error('Slug conflict requires review: '+slug);tag=await call('/tags',{name,slug},'POST',true);allTags.push(tag);}
 if(!tag.active)throw Error('Matching tag is inactive; needs explicit resolution: '+name);
 const current=await call('/requirements/'+before.id);assert.equal(current.title,before.title);assert.equal(current.requirementCode,code);
 const tagIds=[...new Set([...current.tags.map(t=>t.id),tag.id])];
 if(!current.tags.some(t=>t.id===tag.id))await call('/requirements/'+current.id,{tagIds},'PATCH');
 const after=await call('/requirements/'+current.id);
 for(const field of ['id','requirementCode','title','content','contentVersion','categoryId','industry','department','difficulty','implementationStatus','expectedOutcome','shareConsent','coverMediaId','images','files'])assert.deepEqual(after[field],before[field],code+' must preserve '+field);
 assert.ok(before.tags.every(t=>after.tags.some(a=>a.id===t.id)),'Existing tags lost');assert.ok(after.tags.some(t=>t.id===tag.id),'New tag missing');
 report.push({code,id:after.id,tagId:tag.id,tags:after.tags.map(t=>({id:t.id,name:t.name}))});save('progress.json',report);
}
save('after.json',{environment:base,results:report});console.log(JSON.stringify({environment:base,verified:true,results:report}));
