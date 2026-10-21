// Explicit local-only import. Never called by startup or migration.
import fs from 'node:fs';
import path from 'node:path';
const source=process.argv[2];
const origin=process.env.MEDICAL_DEMO_API??'http://127.0.0.1:3011/api';
const key=process.env.MEDICAL_DEMO_API_KEY;
if(!source||!key||!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Usage: MEDICAL_DEMO_API_KEY=<local account key> npm run demo:medical -- <reference directory>; only localhost is allowed');
const read=(names)=>{const found=names.map(n=>path.join(source,n)).find(p=>fs.existsSync(p));if(!found)throw new Error('Reference file missing: '+names.join(' / '));return JSON.parse(fs.readFileSync(found,'utf8'));};
const record=read(['平台需求记录.json','04.json']),detail=read(['需求详细文档.json','03.json']);
const request=async(route,body,method=body?'POST':'GET')=>{const r=await fetch(origin+route,{method,headers:{Authorization:'Bearer '+key,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
const code=record.requirementCode;if(!/^MED-REQ-[0-9]{4,10}$/.test(code))throw new Error('Invalid business code');
let existing;
for(let page=1;;page++){const result=await request('/requirements?page='+page+'&pageSize=100');existing=result.items.find(r=>r.requirementCode===code);if(existing||page*result.pageSize>=result.total)break;}
const imagePaths=[['MED-REQ-0004_cover.png','01.png'],['MED-REQ-0004_card.png','11.png']].map(names=>names.map(n=>path.join(source,n)).find(p=>fs.existsSync(p))).filter(Boolean);
const importImages=async()=>{const ids=[];for(const location of imagePaths){const form=new FormData();form.append('file',new Blob([fs.readFileSync(location)]),path.basename(location));ids.push((await request('/media',form)).id);}return ids;};
if(existing){
  if(existing.images.length||!imagePaths.length){console.log('Already imported; no changes: '+existing.requirementCode);process.exit(0);}
  const mediaIds=await importImages();await request('/requirements/'+existing.id,{mediaIds,coverMediaId:mediaIds[0]??null},'PATCH');
  console.log('Added cover and detail images: '+existing.requirementCode);process.exit(0);
}
const fields=record.platformWritableFields;
const content=fields.content.replace(/^(适用场景|业务痛点|核心需求|预期效果|需求边界)：/gm,'## $1\n\n');
const agent=`# ${fields.title} — Agent 阅读材料\n\n需求编号：${code}\n内容版本：${detail.version}\n\n`+detail.sections.map(section=>'## '+section.title+'\n\n'+section.items.map(item=>'### '+item.title+'\n\n'+item.text).join('\n\n')).join('\n\n');
const form=new FormData();form.append('purpose','agent');form.append('file',new Blob([agent],{type:'text/markdown'}),`${code}-Agent.md`);
const file=await request('/files',form);
// Do not copy old platform UUIDs, category/tag/media IDs or unsupported evaluation claims.
const mediaIds=await importImages();
const created=await request('/requirements',{title:fields.title,content,requirementCode:code,contentVersion:record.version,industry:fields.industry,department:fields.department,expectedOutcome:fields.expectedOutcome,implementationStatus:'pending',fileIds:[file.id],mediaIds,coverMediaId:mediaIds[0]??null});
const folder=path.resolve('storage/demo-materials');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,code+'.md'),content,'utf8');fs.writeFileSync(path.join(folder,code+'-Agent.md'),agent,'utf8');
console.log(`Imported reference ${code}; local record ${created.id}; Markdown copies: storage/demo-materials/`);
