import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const defaultScopes=['requirements:read','requirements:write','cases:read','taxonomy:read','media:read','media:write'];
async function harness(t){
 const dir=mkdtempSync(path.join(tmpdir(),'jack-key-security-'));
 const reserve=net.createServer().listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const database=path.join(dir,'test.db'),master=randomBytes(32).toString('hex');let child,sql;
 async function stop(){if(child&&child.exitCode===null){const end=once(child,'exit');child.kill();await end;}child=null;sql?.close();sql=null;}
 async function start(overrides={}){
  let output='';child=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATABASE_URL:database,STORAGE_DIR:path.join(dir,'uploads'),SESSION_SECRET:'isolated-test-session-secret-at-least-32-chars',API_KEY_ENCRYPTION_KEY:master,TRUSTED_PROXY_IPS:'',...overrides},stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',c=>{output+=c;});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error(output)));});
  sql=new Database(overrides.DATABASE_URL??database);sql.prepare('INSERT OR IGNORE INTO categories(id,name,slug) VALUES(?,?,?)').run('fixture-category','业务分类','fixture-category');return sql;
 }
 const request=async(route,{token,cookie,headers={},method='GET',body}={})=>{
  const response=await fetch(`http://127.0.0.1:${port}/api${route}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(cookie?{Cookie:cookie}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:response.status,body:data,retry:response.headers.get('retry-after'),cache:response.headers.get('cache-control'),setCookies:response.headers.getSetCookie(),cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};
 };
 t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
 await start();return {dir,database,master,start,stop,request,get sql(){return sql;}};
}
test('scoped keys, ownership, expiry, revocation and session-only management', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;
 const signup=await call('/auth/register',{method:'POST',body:{email:'owner@example.test',password:'test-password'}});
 assert.equal(signup.status,201);const cookie=signup.cookie,original=signup.body.apiKey,userId=signup.body.user.id;
 const row=h.sql.prepare('SELECT * FROM api_keys').get();assert.ok(row.secret_value===original);assert.equal(row.secret_encrypted,null);assert.deepEqual(JSON.parse(row.scopes),defaultScopes);assert.ok(row.expires_at>Date.now()/1000);
 const listed=await call('/keys',{cookie});assert.equal(listed.body[0].secretValue,original);assert.equal(listed.cache,'no-store');assert.equal(listed.body[0].secretEncrypted,undefined);
 for(const [route,method,body] of [['/keys','GET'],['/keys/rotate','POST',{}],['/keys/taxonomy','POST',{}],['/keys/'+row.id,'DELETE']])assert.equal((await call(route,{token:original,cookie,method,body})).status,403);
 assert.equal((await call('/requirements',{token:original})).status,200);
 assert.equal((await call('/requirements',{token:original,method:'POST',body:{categoryId:'fixture-category',title:'Scoped requirement',content:'Private owner requirement'}})).status,201);
 for(const route of ['/users','/requirements?scope=all','/cases?scope=all','/audit-logs','/stats','/admin/skill'])assert.equal((await call(route,{token:original})).status,403);
 assert.equal((await call('/cases',{token:original})).status,200);
 assert.equal((await call('/categories',{token:original,method:'POST',body:{name:'Denied',slug:'denied'}})).status,403);
 assert.equal((await call('/keys/rotate',{cookie,method:'POST',body:{scopes:['users:write']}})).status,400);
 assert.equal((await call('/keys/rotate',{cookie,method:'POST',body:{expiresInDays:91}})).status,400);
 assert.equal((await call('/keys/taxonomy',{cookie,method:'POST',body:{}})).status,403);
 assert.equal((await call('/keys/rotate',{cookie,method:'POST',body:{scopes:['taxonomy:write']}})).status,403);
 h.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(userId);
 h.sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('other','other@example.test','unused','student','active',1);
 h.sql.prepare('INSERT INTO requirements(id,user_id,title,content,created_at) VALUES(?,?,?,?,?)').run('private','other','Other requirement','Other private content',1);
 h.sql.prepare('INSERT INTO cases(id,title,summary,created_at) VALUES(?,?,?,?)').run('draft','Private draft','Private draft case',1);
 // A scoped key of an admin must not inherit resource-manager bypasses.
 for(const route of ['/requirements/private','/cases/draft']){
  assert.equal((await call(route,{token:original})).status,404);assert.equal((await call(route,{cookie})).status,200);
 }
 assert.equal((await call('/requirements/private',{token:original,method:'PATCH',body:{title:'Denied edit'}})).status,404);
 const taxonomy=await call('/keys/taxonomy',{cookie,method:'POST',body:{expiresInDays:7}});assert.equal(taxonomy.status,201);
 const taxKey=taxonomy.body.apiKey;assert.deepEqual(taxonomy.body.scopes,['taxonomy:read','taxonomy:write']);
 assert.equal((await call('/categories',{token:taxKey,method:'POST',body:{name:'Allowed',slug:'allowed'}})).status,201);
 assert.equal((await call('/tags?scope=all',{token:taxKey})).status,200);
 for(const route of ['/users','/keys','/requirements','/cases'])assert.equal((await call(route,{token:taxKey})).status,403);
 assert.equal((await call('/users/other',{token:taxKey,method:'PATCH',body:{status:'disabled'}})).status,403);
 const again=await call('/keys/taxonomy',{cookie,method:'POST',body:{}});assert.equal(again.status,201);assert.equal((await call('/me',{token:taxKey})).status,401);assert.equal((await call('/me',{token:original})).status,200);
 const rotated=await call('/keys/rotate',{cookie,method:'POST',body:{scopes:['requirements:read'],expiresInDays:1}});assert.equal(rotated.status,201);const limited=rotated.body.apiKey;
 for(const token of [original,again.body.apiKey])assert.equal((await call('/me',{token})).status,401);
 assert.equal((await call('/requirements',{token:limited})).status,200);assert.equal((await call('/requirements',{token:limited,method:'POST',body:{title:'No write',content:'No write allowed'}})).status,403);
 const limitedRow=h.sql.prepare('SELECT * FROM api_keys WHERE hash=?').get(digest(limited));
 await h.stop();await h.start();assert.equal((await call('/keys',{cookie})).body.find(k=>k.id===limitedRow.id).secretValue,limited,'stable master/session survives restart');
 h.sql.prepare('UPDATE api_keys SET expires_at=? WHERE id=?').run(Math.floor(Date.now()/1000),limitedRow.id);assert.equal((await call('/me',{token:limited})).status,401);
 const fresh=await call('/keys/rotate',{cookie,method:'POST',body:{}});assert.equal(fresh.status,201);
 const freshRow=h.sql.prepare('SELECT id FROM api_keys WHERE hash=?').get(digest(fresh.body.apiKey));
 assert.equal((await call('/keys/'+freshRow.id,{cookie,method:'DELETE'})).status,200);assert.equal((await call('/me',{token:fresh.body.apiKey})).status,401);
});
// Main commit 1618338 deliberately moved key display/storage back to secret_value.
// Exercise its current contract without restoring the retired master-key dependency.
test('legacy plaintext and hash-only keys survive restart/backup and remain session-managed', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;
 const signup=await call('/auth/register',{method:'POST',body:{email:'legacy@example.test',password:'test-password'}}),cookie=signup.cookie;
 const legacy='legacy-'+randomBytes(32).toString('hex'),hashOnly='hash-only-'+randomBytes(32).toString('hex');
 h.sql.prepare('INSERT INTO api_keys(id,user_id,name,prefix,hash,secret_value,created_at) VALUES(?,?,?,?,?,?,?)').run('legacy',signup.body.user.id,'Legacy','legacy',digest(legacy),legacy,1);
 h.sql.prepare('INSERT INTO api_keys(id,user_id,name,prefix,hash,created_at) VALUES(?,?,?,?,?,?)').run('hash-only',signup.body.user.id,'Hash only','old',digest(hashOnly),1);
 const verify=async()=>{
  for(const token of [legacy,hashOnly,signup.body.apiKey])assert.equal((await call('/me',{token})).status,200);
  const listed=(await call('/keys',{cookie})).body;
  assert.ok(listed.find(k=>k.id==='legacy').secretValue===legacy);assert.equal(listed.find(k=>k.id==='legacy').legacy,true);assert.equal(listed.find(k=>k.id==='hash-only').secretValue,null);
  assert.equal((await call('/keys',{token:legacy})).status,403);
 };
 await h.stop();await h.start({API_KEY_ENCRYPTION_KEY:''});await verify();
 assert.ok(h.sql.prepare("SELECT secret_value FROM api_keys WHERE id='legacy'").get().secret_value===legacy);
 const backup=path.join(h.dir,'backup.db');await h.sql.backup(backup);
 await h.stop();await h.start({API_KEY_ENCRYPTION_KEY:randomBytes(32).toString('hex')});await verify();
 await h.stop();await h.start({DATABASE_URL:backup});await verify();
 const rotation=await call('/keys/rotate',{cookie,method:'POST',body:{}});assert.equal(rotation.status,201);
 for(const token of [legacy,hashOnly])assert.equal((await call('/me',{token})).status,401);
});
test('auth limits count success/failure and ignore forged forwarding headers by default', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;
 const signup=await call('/auth/register',{method:'POST',body:{email:'login@example.test',password:'test-password'}});assert.equal(signup.status,201);
 for(const body of [{email:'missing@example.test',password:'test-password'},{email:'login@example.test',password:'wrong-password'}]){
  const response=await call('/auth/login',{method:'POST',body});assert.equal(response.status,401);assert.deepEqual(response.body,{error:'Invalid credentials'});
 }
 h.sql.prepare("UPDATE users SET status='disabled'").run();assert.equal((await call('/auth/login',{method:'POST',body:{email:'login@example.test',password:'test-password'}})).status,401);h.sql.prepare("UPDATE users SET status='active'").run();
 // Disabled + wrong attempts above count toward the same email bucket.
 for(let i=0;i<8;i++)assert.equal((await call('/auth/login',{method:'POST',body:{email:'login@example.test',password:'test-password'}})).status,200);
 const blocked=await call('/auth/login',{method:'POST',body:{email:'login@example.test',password:'test-password'}});assert.equal(blocked.status,429);assert.ok(Number(blocked.retry)>0);
 await h.stop();await h.start({AUTH_LOGIN_IP_LIMIT:'20'});
 for(let i=0;i<20;i++)assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${i+1}`},body:{email:`missing${i}@example.test`,password:'test-password'}})).status,401);
 const ipBlocked=await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.99'},body:{email:'new@example.test',password:'test-password'}});assert.equal(ipBlocked.status,429);assert.ok(Number(ipBlocked.retry)>0);
 await h.stop();await h.start({AUTH_REGISTER_IP_LIMIT:'5'});
 for(let i=0;i<5;i++)assert.equal((await call('/auth/register',{method:'POST',body:{email:'login@example.test',password:'test-password'}})).status,409);
 const registerBlocked=await call('/auth/register',{method:'POST',body:{email:'new@example.test',password:'test-password'}});assert.equal(registerBlocked.status,429);assert.ok(Number(registerBlocked.retry)>0);
});
test('only explicit trusted proxy peers can supply client IP; rightmost untrusted hop wins', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;await h.stop();await h.start({TRUSTED_PROXY_IPS:'127.0.0.1',AUTH_LOGIN_IP_LIMIT:'20'});
 // A proxy appended real address to attacker-supplied left-side values: varying the left side cannot bypass limits.
 for(let i=0;i<20;i++)assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${i+1}, 198.51.100.10`},body:{email:`unknown${i}@example.test`,password:'test-password'}})).status,401);
 assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':'192.0.2.100, 198.51.100.10'},body:{email:'another@example.test',password:'test-password'}})).status,429);
 assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.11'},body:{email:'another@example.test',password:'test-password'}})).status,401,'different actual proxy client has separate IP bucket');
});

test('medical files and Markdown downloads obey scoped ownership and public approval', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;
 const signup=async email=>{const result=await call('/auth/register',{method:'POST',body:{email,password:'test-password'}});assert.equal(result.status,201);return {...result.body,cookie:result.cookie};};
 const owner=await signup('files-owner@example.test'),admin=await signup('files-admin@example.test'),other=await signup('files-other@example.test');
 h.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.user.id);
 const form=new FormData();form.append('file',new Blob(['# Private attachment']),'private.md');
 const upload=await call('/files',{token:owner.apiKey,method:'POST',body:form});assert.equal(upload.status,201);const fileId=upload.body.id;
 assert.equal((await call('/files',{token:owner.apiKey})).body.length,1);
 assert.equal((await call('/files?scope=all',{token:admin.apiKey})).status,403);
 for(const token of [admin.apiKey,other.apiKey])assert.equal((await call(`/files/${fileId}/download`,{token})).status,403);
 assert.equal((await call(`/files/${fileId}/download`,{token:owner.apiKey})).body,'# Private attachment');
 const created=await call('/requirements',{token:owner.apiKey,method:'POST',body:{categoryId:'fixture-category',title:'Scoped medical materials',content:'# Private requirement',shareConsent:true,fileIds:[fileId],contentVersion:'v2.0'}});assert.equal(created.status,201);
 const reqId=created.body.id;assert.match(created.body.requirementCode,/^MED-REQ-/);assert.equal(created.body.contentVersion,'v2.0');
 // A scoped Agent can explicitly resubmit only its own returned requirement, with write scope.
 h.sql.prepare("UPDATE requirements SET status='rejected' WHERE id=?").run(reqId);
 assert.equal((await call(`/requirements/${reqId}/resubmit`,{token:admin.apiKey,method:'POST',body:{}})).status,404);
 assert.equal((await call(`/requirements/${reqId}/resubmit`,{token:owner.apiKey,method:'POST',body:{}})).status,200);
 assert.equal((await call(`/requirements/${reqId}/resubmit`,{token:owner.apiKey,method:'POST',body:{}})).status,409);

 assert.equal((await call(`/requirements/${reqId}/download`,{token:owner.apiKey})).body,'# Private requirement');
 assert.match((await call(`/requirements/${reqId}/download?format=ai`,{token:owner.apiKey})).body,/v2.0/);
 assert.equal((await call(`/requirements/${reqId}/download`,{token:admin.apiKey})).status,404);assert.equal((await call(`/requirements/${reqId}/download`,{cookie:admin.cookie})).status,200);
 assert.equal((await call(`/requirements/${reqId}`,{token:owner.apiKey,method:'PATCH',body:{content:'# Private requirement revised'}})).status,200);
 assert.equal((await call(`/requirements/${reqId}`,{token:owner.apiKey})).body.contentVersion,'v2.1');
 assert.equal((await call(`/requirements/${reqId}/review`,{token:admin.apiKey,method:'POST',body:{decision:'reject'}})).status,403);
 const reviewed=await call(`/requirements/${reqId}/review`,{cookie:admin.cookie,method:'POST',body:{decision:'approve',summary:'Public approved summary',requirementPrompt:'# Public material',approvedFileIds:[fileId]}});assert.equal(reviewed.status,200);const caseId=reviewed.body.caseId;
 assert.match((await call(`/cases/${caseId}/download`,{token:other.apiKey})).body,/# Public material/);
 assert.ok(!(await call(`/cases/${caseId}/download`,{token:other.apiKey})).body.includes('# Private requirement'));
 assert.equal((await call(`/files/${fileId}/download`,{token:other.apiKey})).status,200);
 assert.equal((await call(`/cases/${caseId}/files`,{token:admin.apiKey,method:'PUT',body:{files:[]}})).status,403);
 const tax=await call('/keys/taxonomy',{cookie:admin.cookie,method:'POST',body:{}});assert.equal((await call(`/files/${fileId}/download`,{token:tax.body.apiKey})).status,403);
 h.sql.prepare("UPDATE users SET role='student' WHERE id=?").run(admin.user.id);assert.equal((await call('/categories',{token:tax.body.apiKey,method:'POST',body:{name:'No role',slug:'no-role'}})).status,403);h.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.user.id);
 assert.equal((await call(`/cases/${caseId}/status`,{cookie:admin.cookie,method:'POST',body:{status:'archived'}})).status,200);
 assert.equal((await call(`/files/${fileId}/download`,{token:other.apiKey})).status,403);assert.equal((await call(`/cases/${caseId}/download`,{token:other.apiKey})).status,404);
 const readonly=await call('/keys/rotate',{cookie:owner.cookie,method:'POST',body:{scopes:['requirements:read']}});
 assert.equal((await call(`/files/${fileId}/download`,{token:readonly.body.apiKey})).status,403);
 assert.equal((await call(`/requirements/${reqId}/resubmit`,{token:readonly.body.apiKey,method:'POST',body:{}})).status,403);
 assert.equal((await call(`/files/${fileId}/download`,{token:owner.apiKey})).status,401);
 const deniedForm=new FormData();deniedForm.append('file',new Blob(['No write']),'denied.txt');assert.equal((await call('/files',{token:readonly.body.apiKey,method:'POST',body:deniedForm})).status,403);
});

test('production HTTPS proxy supports secure login, untrusted forwarding cannot spoof transport', {timeout:30000},async t=>{
 const h=await harness(t),call=h.request;
 const user=await call('/auth/register',{method:'POST',body:{email:'secure-proxy@example.test',password:'test-password'}});assert.equal(user.status,201);
 await h.stop();await h.start({NODE_ENV:'production',TRUSTED_PROXY_IPS:'127.0.0.1'});
 const secure=await call('/auth/login',{method:'POST',headers:{'X-Forwarded-Proto':'https','X-Forwarded-For':'192.0.2.20'},body:{email:'secure-proxy@example.test',password:'test-password'}});
 assert.equal(secure.status,200);assert.ok(secure.setCookies.some(value=>/; secure/i.test(value)));
 assert.equal((await call('/me',{cookie:secure.cookie,headers:{'X-Forwarded-Proto':'https'}})).status,200);
 assert.equal((await call('/auth/register',{method:'POST',headers:{'X-Forwarded-Proto':'https'},body:{email:'new-proxy@example.test',password:'test-password'}})).status,201);
 await h.stop();await h.start({NODE_ENV:'production',TRUSTED_PROXY_IPS:''});
 const spoofed=await call('/auth/login',{method:'POST',headers:{'X-Forwarded-Proto':'https','X-Forwarded-For':'192.0.2.21'},body:{email:'secure-proxy@example.test',password:'test-password'}});
 assert.equal(spoofed.status,400);assert.deepEqual(spoofed.setCookies,[]);assert.equal(spoofed.body.error,'HTTPS required for authentication');
 const register=await call('/auth/register',{method:'POST',headers:{'X-Forwarded-Proto':'https'},body:{email:'no-transport@example.test',password:'test-password'}});assert.equal(register.status,400);assert.equal(h.sql.prepare("SELECT count(*) AS n FROM users WHERE email='no-transport@example.test'").get().n,0);
});
test('default IP quotas support a shared workshop while each account remains bounded', {timeout:30000},async t=>{
 const h=await harness(t),call=h.request;
 // More than the old five registrations and twenty logins, sharing a single real IP.
 for(let i=0;i<6;i++)assert.equal((await call('/auth/register',{method:'POST',body:{email:`workshop${i}@example.test`,password:'test-password'}})).status,201);
 const fastFixture=bcrypt.hashSync('test-password',4);h.sql.prepare('UPDATE users SET password_hash=?').run(fastFixture);
 for(let i=0;i<25;i++)assert.equal((await call('/auth/login',{method:'POST',body:{email:`workshop${i%6}@example.test`,password:'test-password'}})).status,200);
 // Five prior logins on account zero, then five failures consume its remaining quota.
 for(let i=0;i<5;i++)assert.equal((await call('/auth/login',{method:'POST',body:{email:'workshop0@example.test',password:'wrong-password'}})).status,401);
 const blocked=await call('/auth/login',{method:'POST',body:{email:'workshop0@example.test',password:'test-password'}});assert.equal(blocked.status,429);assert.ok(Number(blocked.retry)>0);
 assert.equal((await call('/auth/login',{method:'POST',body:{email:'workshop1@example.test',password:'test-password'}})).status,200);
});
