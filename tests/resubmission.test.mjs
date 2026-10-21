import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';

// Exercise real HTTP routes with an isolated database and upload directory.
test('returned requirement: reasons, draft save, explicit resubmit, review and access control',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'jack-resubmit-'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const dbFile=path.join(dir,'test.db');
 const child=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{env:{...process.env,PORT:String(port),DATABASE_URL:dbFile,STORAGE_DIR:path.join(dir,'uploads'),SESSION_SECRET:'resubmission-test-only-stable-secret-32chars'},stdio:'pipe'});
 let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
 let db;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/api/health`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,50));}assert.ok(ready,log);
  db=new Database(dbFile);db.pragma('foreign_keys = ON');
  for(const [id,role] of [['author','student'],['other','student'],['admin','admin'],['reviewer','reviewer']]){
   db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(id,id+'@test.local','unused',role,1);
   db.prepare('INSERT INTO api_keys(id,user_id,name,prefix,hash,created_at) VALUES(?,?,?,?,?,?)').run(id,id,'Test',id,createHash('sha256').update(id).digest('hex'),1);
  }
  db.prepare('INSERT INTO categories(id,name,slug) VALUES(?,?,?)').run('cat','分类','category');
  for(const id of ['tag1','tag2'])db.prepare('INSERT INTO tags(id,name,slug) VALUES(?,?,?)').run(id,id,id);
  for(const [id,owner] of [['photo1','author'],['photo2','author'],['foreign','other']])db.prepare('INSERT INTO media(id,owner_id,storage_key,mime_type,size,created_at) VALUES(?,?,?,?,?,?)').run(id,owner,id+'.webp','image/webp',1,1);
  const call=async(actor,method,url,body,status=200)=>{const r=await fetch(`http://127.0.0.1:${port}/api${url}`,{method,headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
  const upload=async(actor,name,content)=>{const form=new FormData();form.append('file',new Blob([content]),name);form.append('purpose','agent');const r=await fetch(`http://127.0.0.1:${port}/api/files`,{method:'POST',headers:{Authorization:'Bearer '+actor},body:form});assert.equal(r.status,201);return r.json();};
  const initialFile=await upload('author','原始私有说明.md','# PRIVATE-ORIGINAL-MATERIAL');
  const addedFile=await upload('author','补充验收标准.md','# PUBLIC-APPROVED-MATERIAL');
  const adminFile=await upload('admin','管理员参考资料.md','# ADMIN-PRIVATE-MATERIAL');
  const foreignFile=await upload('other','他人文档.md','# FOREIGN-MATERIAL');
  const original={fileIds:[initialFile.id],title:'库存需求',content:'# 背景\n库存预警需要补充验收标准。',shareConsent:true,categoryId:'cat',industry:'医疗器械',department:'采购',difficulty:'medium',implementationStatus:'building',expectedOutcome:'减少缺货',tagIds:['tag1'],mediaIds:['photo1']};
  const {id}=await call('author','POST','/requirements',original,201);const url='/requirements/'+id;
  const initial=await call('author','GET',url);assert.match(initial.requirementCode,/^MED-REQ-/);assert.equal(initial.contentVersion,'v1.0');assert.equal(initial.files[0].id,initialFile.id);
  await call('author','POST',url+'/resubmit',{},409);
  await call('other','GET',url,undefined,404);await call('other','PATCH',url,{title:'非法更改'},404);await call('other','POST',url+'/resubmit',{},404);await call('author','POST',url+'/review',{decision:'reject',notes:'非法审核'},403);
  await call('admin','POST',url+'/review',{decision:'reject',notes:'  '},400);
  const reason='请补充库存阈值及验收标准。\n图片需脱敏。';await call('reviewer','POST',url+'/review',{decision:'reject',notes:reason});
  let item=await call('author','GET',url);assert.equal(item.status,'rejected');assert.equal(item.reviews[0].notes,reason);
  const listed=await call('author','GET','/requirements');assert.equal(listed[0].reviews[0].notes,reason);
  await call('admin','POST',url+'/review',{decision:'approve'},409);
  await call('author','PATCH',url,{fileIds:[foreignFile.id]},400);await call('author','PATCH',url,{fileIds:[initialFile.id,initialFile.id]},400);await call('admin','PATCH',url,{shareConsent:false},403);
  await call('author','PATCH',url,{mediaIds:['foreign']},400);await call('author','PATCH',url,{mediaIds:['photo1','photo1']},400);await call('author','PATCH',url,{tagIds:['missing']},400);
  await call('author','PATCH',url,{title:'修改后的库存需求',content:'# 验收标准\n低于十件触发预警。',fileIds:[initialFile.id,addedFile.id],requirementCode:'MED-REQ-9999',categoryId:null,industry:null,department:'仓储',difficulty:'easy',implementationStatus:'pending',expectedOutcome:'及时补货',tagIds:['tag2'],mediaIds:['photo2']});
  item=await call('author','GET',url);assert.equal(item.status,'rejected');assert.equal(item.requirementCode,initial.requirementCode);assert.equal(item.contentVersion,'v1.1');assert.deepEqual(item.files.map(f=>f.id).sort(),[initialFile.id,addedFile.id].sort());assert.equal(item.reviews.length,1);assert.equal(item.categoryId,null);assert.equal(item.industry,null);assert.equal(item.department,'仓储');assert.equal(item.difficulty,'easy');assert.equal(item.implementationStatus,'pending');assert.equal(item.expectedOutcome,'及时补货');assert.equal(item.shareConsent,true);assert.deepEqual(item.images.map(x=>x.id),['photo2']);assert.deepEqual(item.tags.map(x=>x.id),['tag2']);
  await call('admin','PATCH',url,{fileIds:[initialFile.id,addedFile.id,adminFile.id]});await call('author','PATCH',url,{fileIds:[initialFile.id,addedFile.id,adminFile.id]});
  db.prepare('UPDATE tags SET active=0 WHERE id=?').run('tag2');await call('author','PATCH',url,{tagIds:['tag2']});await call('other','POST','/requirements',{...original,mediaIds:[],tagIds:['tag2']},400);
  await call('author','PATCH',url,{content:'# 再次保存\nPRIVATE-RESUBMISSION：保留图片、材料与标签，不会自动提交。'});item=await call('author','GET',url);assert.equal(item.images[0].id,'photo2');assert.equal(item.tags[0].id,'tag2');assert.equal(item.status,'rejected');assert.equal(item.contentVersion,'v1.2');assert.equal(item.requirementCode,initial.requirementCode);assert.equal(item.files.length,3);
  const raw=await fetch(`http://127.0.0.1:${port}/api${url}/download`,{headers:{Authorization:'Bearer author'}});assert.equal(raw.status,200);assert.equal(await raw.text(),item.content);const rawHeader=decodeURIComponent(raw.headers.get('content-disposition'));assert.ok(rawHeader.includes(initial.requirementCode+'-v1.2'));
  const resubmits=await Promise.all([1,2].map(()=>fetch(`http://127.0.0.1:${port}/api${url}/resubmit`,{method:'POST',headers:{Authorization:'Bearer author'}})));assert.deepEqual(resubmits.map(r=>r.status).sort(),[200,409]);
  item=await call('admin','GET',url);assert.equal(item.status,'submitted');assert.equal(item.submissions.length,1);assert.equal(item.reviews.length,1);assert.equal(item.contentVersion,'v1.2');assert.equal(item.files.length,3);
  // Another cycle in the same second must show the newest reason first.
  await call('admin','POST',url+'/review',{decision:'reject',notes:'第二次退回：补充负责人'});item=await call('author','GET',url);assert.equal(item.reviews[0].notes,'第二次退回：补充负责人');
  await call('admin','POST',url+'/resubmit',{});
  await call('admin','POST',url+'/review',{decision:'approve',approvedFileIds:[foreignFile.id]},400);
  const approvals=await Promise.all([1,2].map(()=>fetch(`http://127.0.0.1:${port}/api${url}/review`,{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify({decision:'approve',approvedMediaIds:['photo2'],approvedFileIds:[addedFile.id],requirementPrompt:'# 公开正文\n已脱敏的库存预警场景。'})})));assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);const approved=await approvals.find(r=>r.status===200).json();assert.ok(approved.caseId);
  await call('admin','POST',url+'/review',{decision:'approve'},409);await call('admin','POST',url+'/review',{decision:'reject',notes:'重复'},409);await call('author','POST',url+'/resubmit',{},409);await call('author','PATCH',url,{title:'学生改已发布'},409);
  item=await call('author','GET',url);assert.equal(item.status,'published');assert.equal(item.reviews.length,3);assert.equal(item.submissions.length,2);assert.equal(item.reviews[2].notes,reason);
  const published=await call('other','GET','/cases/'+approved.caseId);assert.equal(published.requirementCode,initial.requirementCode);assert.equal(published.contentVersion,'v1.2');assert.equal(published.publicContent,'# 公开正文\n已脱敏的库存预警场景。');assert.deepEqual(published.files.map(f=>f.id),[addedFile.id]);
  const caseDownload=await fetch(`http://127.0.0.1:${port}/api/cases/${approved.caseId}/download`,{headers:{Authorization:'Bearer other'}});assert.equal(caseDownload.status,200);const publicMd=await caseDownload.text();assert.ok(publicMd.includes('已脱敏的库存预警场景'));assert.ok(!publicMd.includes('PRIVATE-RESUBMISSION'));
  for(const file of [initialFile,adminFile]){const r=await fetch(`http://127.0.0.1:${port}/api/files/${file.id}/download`,{headers:{Authorization:'Bearer other'}});assert.equal(r.status,403);}
  const publicFile=await fetch(`http://127.0.0.1:${port}/api/files/${addedFile.id}/download`,{headers:{Authorization:'Bearer other'}});assert.equal(publicFile.status,200);assert.equal(await publicFile.text(),'# PUBLIC-APPROVED-MATERIAL');
  assert.equal(db.prepare('SELECT count(*) AS n FROM cases WHERE requirement_id=?').get(id).n,1);assert.equal(db.prepare('SELECT count(*) AS n FROM case_tags WHERE case_id=?').get(approved.caseId).n,1);assert.equal(db.prepare('SELECT count(*) AS n FROM case_media WHERE case_id=?').get(approved.caseId).n,1);
 }finally{db?.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(dir,{recursive:true,force:true});}
});
