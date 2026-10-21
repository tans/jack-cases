import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';

test('business profile: shared API, lifecycle, permissions, PATCH and compatibility',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'business-fields-'));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{env:{...process.env,PORT:String(port),DATABASE_URL:path.join(temp,'test.db'),STORAGE_DIR:path.join(temp,'uploads'),SESSION_SECRET:'business-isolated-session-secret-more-than-32',API_KEY_ENCRYPTION_KEY:randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',b=>logs+=b);let db;
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}db?.close();fs.rmSync(temp,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}/api`;
 for(let i=0;i<100;i++){if(child.exitCode!==null)assert.fail(logs);try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));if(i===99)assert.fail(logs);}
 db=new DatabaseSync(path.join(temp,'test.db'));
 const call=async(url,auth,body,method=body?'POST':'GET')=>{const r=await fetch(base+url,{method,headers:{...(auth?.cookie?{Cookie:auth.cookie}:auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};};
 const author=await call('/auth/register',null,{email:'author@business.test',password:'test-password'}),admin=await call('/auth/register',null,{email:'admin@business.test',password:'test-password'});db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.data.user.id);
 const cookie={cookie:admin.cookie},key=author.data.apiKey;
 const category=await call('/categories',cookie,{name:'业务分类',slug:'business'});assert.equal(category.status,201);
 const baseReq={title:'业务画像回归',content:'原始正文和共享授权不得被画像编辑改变。',categoryId:category.data.id};let id,option,tag;
 await t.test('all optional fields can be absent or explicitly empty; no inferred assessment',async()=>{
  const created=await call('/requirements',key,baseReq);assert.equal(created.status,201);id=created.data.id;
  const {data:r}=await call('/requirements/'+id,key);assert.deepEqual(r.applicableEntities,[]);assert.deepEqual(r.subdomains,[]);assert.equal(r.urgency,'pending');assert.equal(r.difficulty,null);assert.equal(r.valueAssessment,null);assert.equal(r.shareConsent,false);
  const empty=await call('/requirements',key,{...baseReq,applicableEntities:[],circulationTypes:[],businessModes:[],subdomains:[],urgencyReason:null,valueAssessment:null,difficulty:null});assert.equal(empty.status,201);
 });
 await t.test('valid IDs, independent industry/subdomain and list filters',async()=>{
  const options=await call('/business-options',key);assert.equal(options.status,200);assert.ok(options.data.every(o=>o.id&&o.name));
  const p={industry:'医疗器械',applicableEntities:['entity-manufacturer'],circulationTypes:['circulation-dealer','circulation-delivery'],businessModes:['mode-direct'],subdomains:['subdomain-orthopedics'],urgency:'high',urgencyReason:'人工确认的业务截止日期',valueAssessment:'价值及条件待验证',difficulty:null};assert.equal((await call('/requirements/'+id,key,p,'PATCH')).status,200);
  for(const [field,value] of Object.entries({...Object.fromEntries(Object.entries(p).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v[0]])),urgency:'high',industry:'医疗器械'})){
   const r=await call('/requirements?page=1&'+new URLSearchParams({[field]:value}),key);assert.equal(r.status,200);assert.ok(r.data.items.some(x=>x.id===id),field);
  }
  const miss=await call('/requirements?page=1&subdomains=subdomain-trauma',key);assert.ok(!miss.data.items.some(x=>x.id===id));
  assert.equal((await call('/requirements/'+id,key,{industry:'医疗器械、IVD'},'PATCH')).status,200);
 });
 await t.test('invalid IDs, wrong fields, duplicates and circulation exclusivity return explicit 400',async()=>{
  for(const p of [{subdomains:['unknown']},{subdomains:['mode-direct']},{businessModes:['mode-direct','mode-direct']},{circulationTypes:['circulation-na','circulation-dealer']},{circulationTypes:['circulation-pending','circulation-delivery']},{circulationTypes:['circulation-na','circulation-pending']},{urgency:'critical'}]){const r=await call('/requirements/'+id,key,p,'PATCH');assert.equal(r.status,400,JSON.stringify(p));assert.ok(r.data.error);}
  for(const circulationTypes of [['circulation-pending'],['circulation-na'],[]])assert.equal((await call('/requirements/'+id,key,{circulationTypes},'PATCH')).status,200);
 });
 await t.test('PATCH omission preserves data and attachments; explicit clear takes effect independently',async()=>{
  db.prepare("INSERT INTO media(id,owner_id,storage_key,mime_type,size,created_at) VALUES (?,?,?,?,?,?)").run('legacy-image',author.data.user.id,'image.webp','image/webp',12,1);db.prepare('INSERT INTO requirement_media VALUES(?,?,?)').run(id,'legacy-image',0);db.prepare('UPDATE requirements SET cover_media_id=? WHERE id=?').run('legacy-image',id);
  db.prepare('INSERT INTO files(id,owner_id,storage_key,name,purpose,mime_type,size,created_at) VALUES(?,?,?,?,?,?,?,?)').run('agent-document',author.data.user.id,'agent.md','独立Agent文档.md','agent','text/markdown',12,1);db.prepare('INSERT INTO requirement_files VALUES(?,?)').run(id,'agent-document');
  const before=(await call('/requirements/'+id,key)).data;
  await call('/requirements/'+id,key,{urgencyReason:'仅修改依据'},'PATCH');let after=(await call('/requirements/'+id,key)).data;
  for(const f of ['id','requirementCode','content','contentVersion','categoryId','industry','coverMediaId','shareConsent','images','files','subdomains','urgency','valueAssessment'])assert.deepEqual(after[f],before[f],f);
  await call('/requirements/'+id,key,{subdomains:[],valueAssessment:null,urgencyReason:null,difficulty:null},'PATCH');after=(await call('/requirements/'+id,key)).data;assert.deepEqual(after.subdomains,[]);assert.equal(after.valueAssessment,null);assert.equal(after.urgency,'high');assert.equal(after.difficulty,null);
  await call('/requirements/'+id,key,{content:baseReq.content+'补充正文'},'PATCH');after=(await call('/requirements/'+id,key)).data;assert.equal(after.contentVersion,'v1.1');
 });
 await t.test('independent taxonomy authority; read-only keys cannot create or modify options/tags',async()=>{
  const readonly=await call('/keys/rotate',{cookie:author.cookie},{scopes:['taxonomy:read']});assert.equal(readonly.status,201);
  const readKey=readonly.data.apiKey;
  for(const endpoint of ['/tags','/business-options']){assert.equal((await call(endpoint,readKey)).status,200);assert.equal((await call(endpoint,readKey,{name:'Denied',field:'subdomains',slug:'denied'})).status,403);assert.equal((await call(endpoint+'/any',readKey,{name:'Denied'},'PATCH')).status,403);}
  const tax=await call('/keys/taxonomy',cookie,{});assert.equal(tax.status,201);
  option=await call('/business-options',tax.data.apiKey,{field:'subdomains',name:'测试细分'});assert.equal(option.status,201);
  tag=await call('/tags',tax.data.apiKey,{name:'测试标签',slug:'business-test'});assert.equal(tag.status,201);
  assert.equal((await call('/requirements',tax.data.apiKey,baseReq)).status,403);
  // Admin role alone does not elevate its ordinary requirements key.
  assert.equal((await call('/business-options',admin.data.apiKey,{field:'subdomains',name:'不应创建'})).status,403);
 });
 await t.test('rename stable IDs; deactivation preserves old links and rejects new selection',async()=>{
  const owner={cookie:author.cookie};
  assert.equal((await call('/requirements/'+id,owner,{subdomains:[option.data.id],tagIds:[tag.data.id]},'PATCH')).status,200);
  for(const [endpoint,item,name] of [['/business-options',option,'重命名细分'],['/tags',tag,'重命名标签']]){const r=await call(endpoint+'/'+item.data.id,cookie,{name,active:false},'PATCH');assert.equal(r.status,200);assert.equal(r.data.id,item.data.id);}
  const r=(await call('/requirements/'+id,owner)).data;assert.deepEqual(r.subdomains,[option.data.id]);assert.equal(r.tags[0].name,'重命名标签');assert.equal(r.tags[0].active,false);
  assert.equal((await call('/requirements/'+id,owner,{subdomains:r.subdomains,tagIds:r.tags.map(t=>t.id)},'PATCH')).status,200);
  assert.equal((await call('/requirements',owner,{...baseReq,subdomains:r.subdomains})).status,400);assert.equal((await call('/requirements',owner,{...baseReq,tagIds:[tag.data.id]})).status,400);
  assert.equal((await call('/business-options',cookie,{field:'subdomains',name:'重命名细分'})).status,409);
  assert.ok(!(await call('/business-options',owner)).data.some(o=>o.id===option.data.id));assert.ok((await call('/business-options?scope=history',owner)).data.some(o=>o.id===option.data.id&&!o.active));
  assert.equal((await call('/requirements/'+id,owner,{subdomains:[],tagIds:[]},'PATCH')).status,200);
 });
});
