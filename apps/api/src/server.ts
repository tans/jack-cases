import {signingSecret} from './runtime.js';
import {config} from './config.js';
import Koa from 'koa'; import Router from '@koa/router'; import cors from '@koa/cors'; import { koaBody } from 'koa-body';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import os from 'node:os';import fs from 'node:fs';import path from 'node:path';
import bcrypt from 'bcryptjs';import sharp from 'sharp';import { eq,and,desc,isNull,inArray,sql,count } from 'drizzle-orm';import { z } from 'zod';
import {db} from './db.js';import {users,sessions,apiKeys,requirements,cases,casePrompts,media,requirementMedia,caseMedia,categories,reviews,auditLogs,caseEvents,caseComments,tags,requirementTags,caseTags,files,requirementFiles,caseFiles} from './schema.js';
import {registerLists} from './lists.js';
import {proxyBoundary,authRateLimit} from './auth-rate-limit.js';
import { registerUserRoutes } from './routes/users.js';
const app=new Koa();app.proxy=true;app.use(proxyBoundary);const r=new Router({prefix:'/api'});
const deployedCommitFile=process.env.DEPLOYED_COMMIT_FILE;
r.get('/health',ctx=>{let commit:string|null=null;if(deployedCommitFile){try{commit=fs.readFileSync(deployedCommitFile,'utf8').trim()||null;}catch{}}ctx.body={ok:true,commit};});
const origin=process.env.APP_ORIGIN??'http://localhost:5173';app.use(cors({origin,credentials:true}));
app.keys=[signingSecret];
app.use(async(ctx,next)=>{try{await next();if(ctx.status===404)ctx.body={error:'Not found'};}catch(e:any){ctx.status=e.status??e.httpCode??500;ctx.body={error:ctx.status===500?'Internal server error':e.message};if(e instanceof z.ZodError){ctx.status=400;ctx.body={error:e.issues.map((issue:any)=>issue.message).join('; ')};}if(ctx.status===500)console.error(e);}});
// Each request owns its temporary upload directory, including parser failures.
app.use(async(ctx,next)=>{const limit=ctx.path==='/api/media'?(Number(process.env.MAX_IMAGE_MB)||10)*1024*1024:20*1024*1024;const temp=fs.mkdtempSync(path.join(os.tmpdir(),'medical-upload-'));try{await koaBody({multipart:true,formidable:{uploadDir:temp,maxFileSize:limit,maxTotalFileSize:limit,maxFiles:1},jsonLimit:'1mb'})(ctx,async()=>{const uploads=Object.values((ctx.request as any).files??{}).flat() as {size:number}[];if(uploads.length>1||uploads.reduce((n,f)=>n+f.size,0)>limit)bad('Upload limit exceeded',413);await next();});}finally{fs.rmSync(temp,{recursive:true,force:true});}});
const now=()=>Math.floor(Date.now()/1000),id=()=>randomUUID(),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function bad(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
type Actor={id:string;role:string;email:string};
const manager=(a:Actor)=>['admin','super_admin','reviewer'].includes(a.role);
async function actor(ctx:Koa.Context):Promise<Actor>{
  let userId='',keyId:string|undefined;
  const authorization=ctx.get('authorization');
  if(authorization){
    if(!authorization.startsWith('Bearer '))bad('Unauthorized',401);
    const key=db.select().from(apiKeys).where(and(eq(apiKeys.hash,hash(authorization.slice(7))),isNull(apiKeys.revokedAt))).get();
    if(!key)bad('Unauthorized',401);
    userId=key.userId;keyId=key.id;
  }else{
    const session=ctx.cookies.get('jack_session',{signed:true});
    if(session){const entry=db.select().from(sessions).where(eq(sessions.idHash,hash(session))).get();if(entry&&entry.expiresAt>now())userId=entry.userId;}
  }
  const u=userId?db.select().from(users).where(eq(users.id,userId)).get():null;
  if(!u||u.status!=='active')bad('Unauthorized',401);
  if(keyId)db.update(apiKeys).set({lastUsedAt:now()}).where(eq(apiKeys.id,keyId)).run();
  return {id:u.id,role:u.role,email:u.email};
}
async function keyActor(ctx:Koa.Context){
  ctx.set('Cache-Control','no-store');return actor(ctx);
}
const admin=(a:Actor)=>{if(!manager(a))bad('Forbidden',403);};
const taxonomyEditor=(a:Actor)=>{if(!['admin','super_admin'].includes(a.role))bad('Forbidden',403);};
const audit=(a:Actor,action:string,kind:string,item:string)=>db.insert(auditLogs).values({id:id(),actorId:a.id,action,resourceType:kind,resourceId:item,createdAt:now()}).run();
const registerSchema=z.object({email:z.string().trim().email().max(254),password:z.string().min(6).refine(value=>Buffer.byteLength(value,'utf8')<=72,'Password must be at most 72 UTF-8 bytes')});
function keyRecord(userId:string){
  const secret='wk_'+randomBytes(32).toString('base64url'),keyId=id();
  return {secret,record:{id:keyId,userId,name:'API key',prefix:secret.slice(0,12),hash:hash(secret),secretValue:secret,createdAt:now()}};
}
const issueKey=(userId:string)=>{const {secret,record}=keyRecord(userId);db.insert(apiKeys).values(record).run();return secret;};
const sessionCookie=(ctx:Koa.Context,userId:string)=>{const secret=randomBytes(32).toString('base64url');db.insert(sessions).values({idHash:hash(secret),userId,expiresAt:now()+604800}).run();ctx.cookies.set('jack_session',secret,{httpOnly:true,sameSite:'lax',signed:true,secure:process.env.NODE_ENV==='production',maxAge:604800000});};
const safeUser=(u:any)=>({id:u.id,email:u.email,role:u.role,status:u.status,createdAt:u.createdAt});
registerLists(r,actor,admin);
// A fixed cost-12 dummy hash makes unknown-user login follow the same bcrypt work path.
const dummyHash='$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
r.post('/auth/register',async ctx=>{
  ctx.set('Cache-Control','no-store');authRateLimit(ctx);if(process.env.NODE_ENV==='production'&&!ctx.secure)bad('HTTPS required for authentication',400);const d=registerSchema.parse(ctx.request.body),email=d.email.toLowerCase();
  const passwordHash=await bcrypt.hash(d.password,12);
  if(db.select().from(users).where(eq(users.email,email)).get())bad('Email already registered',409);
  const userId=id();
  // No awaits between duplicate check and insert; concurrent registrations cannot race it.
  db.insert(users).values({id:userId,email,passwordHash,createdAt:now()}).run();sessionCookie(ctx,userId);
  ctx.status=201;ctx.body={user:{id:userId,email,role:'student'},apiKey:issueKey(userId)};
});
r.post('/auth/login',async ctx=>{
  ctx.set('Cache-Control','no-store');authRateLimit(ctx);if(process.env.NODE_ENV==='production'&&!ctx.secure)bad('HTTPS required for authentication',400);const d=registerSchema.parse(ctx.request.body);
  const u=db.select().from(users).where(eq(users.email,d.email.toLowerCase())).get();
  const valid=await bcrypt.compare(d.password,u?.passwordHash??dummyHash);
  // Re-read after asynchronous password work so a disabled user cannot acquire a new session.
  const current=u?db.select().from(users).where(eq(users.id,u.id)).get():null;
  if(!valid||!current||current.status!=='active'||current.passwordHash!==u?.passwordHash)bad('Invalid credentials',401);
  sessionCookie(ctx,current.id);ctx.body={user:safeUser(current)};
});
r.post('/auth/logout',async ctx=>{const s=ctx.cookies.get('jack_session',{signed:true});if(s)db.delete(sessions).where(eq(sessions.idHash,hash(s))).run();ctx.cookies.set('jack_session','',{maxAge:0});ctx.body={ok:true};});
r.get('/me',async ctx=>{ctx.body=await actor(ctx);});
r.get('/keys',async ctx=>{
  const a=await keyActor(ctx);
  ctx.body=db.select().from(apiKeys).where(eq(apiKeys.userId,a.id)).orderBy(desc(apiKeys.createdAt),desc(apiKeys.id)).all().map(k=>({
    id:k.id,name:k.name,prefix:k.prefix,createdAt:k.createdAt,revokedAt:k.revokedAt,lastUsedAt:k.lastUsedAt,
    secretValue:k.revokedAt===null?k.secretValue:null
  }));
});
r.post('/keys/rotate',async ctx=>{
  const a=await keyActor(ctx),{secret,record}=keyRecord(a.id);
  db.transaction(tx=>{
    tx.update(apiKeys).set({revokedAt:now(),secretValue:null,secretEncrypted:null}).where(and(eq(apiKeys.userId,a.id),isNull(apiKeys.revokedAt))).run();
    tx.insert(apiKeys).values(record).run();
    tx.insert(auditLogs).values({id:id(),actorId:a.id,action:'rotate',resourceType:'api_key',resourceId:record.id,createdAt:now()}).run();
  });ctx.status=201;ctx.body={apiKey:secret};
});
// Older clients can keep their URLs; every issued key now represents the account.
for(const route of ['/keys/taxonomy','/keys/admin'])r.post(route,async ctx=>{
  const a=await keyActor(ctx);taxonomyEditor(a);
  const {secret,record}=keyRecord(a.id);db.insert(apiKeys).values(record).run();
  audit(a,'issue','api_key',record.id);ctx.status=201;ctx.body={apiKey:secret};
});
r.delete('/keys/:id',async ctx=>{
  const a=await keyActor(ctx),k=db.select().from(apiKeys).where(eq(apiKeys.id,ctx.params.id)).get();
  if(!k||(k.userId!==a.id&&!manager(a)))bad('Not found',404);
  db.update(apiKeys).set({revokedAt:now(),secretValue:null,secretEncrypted:null}).where(eq(apiKeys.id,k.id)).run();ctx.body={ok:true};
});
r.get('/admin/skill',async ctx=>{const a=await actor(ctx);taxonomyEditor(a);ctx.body={version:4,title:'医疗大健康需求平台管理技能',content:`# 医疗大健康需求平台管理技能

使用医疗大健康需求平台 API 审核需求、发布和维护案例、管理分类与标签。API Key 永久有效，所有操作权限跟随所属账号的当前角色。

- API 地址：${origin}/api
- 认证：每个请求使用 Authorization: Bearer <管理员自己的 API Key>；不要把密钥分享给他人或写入代码仓库。
- 待审核需求：GET /requirements?scope=all&status=submitted&page=1&pageSize=50；响应包含 items、total、page 和 pageSize，逐页读取；详情 GET /requirements/{id}。
- 审核并发布：POST /requirements/{id}/review，字段 decision（approve 或 reject）、notes、title、summary、requirementPrompt、buildPrompt、approvedMediaIds、approvedFileIds；强制公开时另传 force=true、forceReason。approve 会创建已发布案例并返回 caseId；reject 必须提供具体 notes。
- 发布前先审阅正文，整理可公开的 title、summary 和 Markdown requirementPrompt；检查个人信息、商业秘密和附件。仅明确审核通过的关联图片或文件可列入 approvedMediaIds / approvedFileIds，未批准的附件保持私有。
- 仅 status=submitted 的需求可审核。常规 approve 必须已有 shareConsent=true；对仅私有需求，只有 admin 或 super_admin 可显式传 force=true 和非空 forceReason，强制发布为公开案例。强制审核必须基于明确指示，forceReason 会写入审核记录；不会改写需求原有 shareConsent。不要把 force 用作默认路径。
- 案例：GET /cases?scope=all；GET /cases/{id}；POST /cases；PATCH /cases/{id}；POST /cases/{id}/status，字段 status（published、draft、archived）。关联需求的案例正常发布要求提交人已授权；已通过强制审核的案例可再次发布。
- 分类：GET /categories；POST /categories；PATCH/DELETE /categories/{id}。字段：name、slug、parentId、sortOrder。
- 标签：GET /tags?scope=all；POST /tags；PATCH/DELETE /tags/{id}。字段：name、slug、group、color、active、sortOrder。
- 附件：GET /files?scope=all；GET /media；沿用详情中的下载地址读取附件，上传使用 POST /files 或 POST /media（multipart）。
- 案例附件审核：PUT /cases/{id}/files，字段 files（数组元素 id、approved）；PUT /cases/{id}/images，字段 mediaIds、coverMediaId，限已关联或本人上传的图片。
- 删除被使用的分类会返回 409；仍被需求或案例引用的标签会停用以保留历史记录。
- 遇到 401/403 时停止操作并报告账号权限或密钥状态错误；遇到 409 时报告当前状态、公开授权或引用冲突，不绕过约束。
- key 只用于识别账号，不单独设置权限或过期时间。服务端每次校验账号当前角色、状态和资源归属，并记录 key 最近使用时间；账号角色变更立即生效，撤销 key 或禁用账号后失效。
- 用户管理、统计、审计日志及其他操作按账号角色校验；仅执行用户已授权的任务。写操作记录审计日志，不要批量覆盖未知字段。`};});
const categoryInput=z.object({name:z.string().trim().min(1).max(80),slug:z.string().regex(/^[a-z0-9-]{1,80}$/),parentId:z.string().nullable().optional(),sortOrder:z.number().int().default(0)});
function categorySlugAvailable(slug:string,excludeId?:string){const found=db.select().from(categories).where(eq(categories.slug,slug)).get();if(found&&found.id!==excludeId)bad('Category slug already exists',409);}
function categoryNameAvailable(name:string,excludeId?:string){const found=db.select().from(categories).where(eq(categories.name,name)).get();if(found&&found.id!==excludeId)bad('Category name already exists',409);}
function validateCategoryParent(parentId:string|null|undefined,itemId?:string){if(!parentId)return;if(parentId===itemId)bad('Category cannot be its own parent');let current=db.select().from(categories).where(eq(categories.id,parentId)).get();if(!current)bad('Parent category not found',404);const visited=new Set<string>();while(current.parentId){if(current.id===itemId||visited.has(current.id))bad('Category parent cycle');visited.add(current.id);const next=db.select().from(categories).where(eq(categories.id,current.parentId)).get();if(!next)break;current=next;}if(current.id===itemId)bad('Category parent cycle');}
r.get('/categories',async ctx=>{await actor(ctx);ctx.body=db.select().from(categories).orderBy(categories.sortOrder,categories.name).all();});
r.post('/categories',async ctx=>{const a=await actor(ctx);taxonomyEditor(a);const d=categoryInput.parse(ctx.request.body);categorySlugAvailable(d.slug);categoryNameAvailable(d.name);validateCategoryParent(d.parentId);const item={id:id(),...d,parentId:d.parentId??null};db.insert(categories).values(item).run();audit(a,'create','category',item.id);ctx.status=201;ctx.body=item;});
r.patch('/categories/:id',async ctx=>{const a=await actor(ctx);taxonomyEditor(a);const existing=db.select().from(categories).where(eq(categories.id,ctx.params.id)).get();if(!existing)bad('Not found',404);const d=categoryInput.partial().parse(ctx.request.body);if(d.slug)categorySlugAvailable(d.slug,existing.id);if(d.name)categoryNameAvailable(d.name,existing.id);if(d.parentId!==undefined)validateCategoryParent(d.parentId,existing.id);db.update(categories).set(d).where(eq(categories.id,existing.id)).run();audit(a,'update','category',existing.id);ctx.body=db.select().from(categories).where(eq(categories.id,existing.id)).get();});
r.delete('/categories/:id',async ctx=>{const a=await actor(ctx);taxonomyEditor(a);const item=db.select().from(categories).where(eq(categories.id,ctx.params.id)).get();if(!item)bad('Not found',404);if(db.select().from(categories).where(eq(categories.parentId,item.id)).get()||db.select().from(requirements).where(eq(requirements.categoryId,item.id)).get()||db.select().from(cases).where(eq(cases.categoryId,item.id)).get())bad('Category is in use',409);db.delete(categories).where(eq(categories.id,item.id)).run();audit(a,'delete','category',item.id);ctx.body={ok:true};});

const tagInput=z.object({name:z.string().trim().min(1).max(40),slug:z.string().regex(/^[a-z0-9-]{2,60}$/),group:z.string().trim().min(1).max(40).default('general'),color:z.enum(['orange','blue','green','purple','gray']).default('orange'),active:z.boolean().default(true),sortOrder:z.number().int().default(0)});
const tagIds=z.array(z.string()).max(12).default([]);
function validateTags(ids:string[],retained:string[]=[]){if(new Set(ids).size!==ids.length)bad('Duplicate tag');if(ids.length){const rows=db.select().from(tags).where(inArray(tags.id,ids)).all();if(rows.length!==ids.length||rows.some(x=>!x.active&&!retained.includes(x.id)))bad('Unknown or inactive tag');}}
const tagsFor=(type:'requirement'|'case',resourceId:string)=>{const linked=type==='requirement'?db.select().from(requirementTags).where(eq(requirementTags.requirementId,resourceId)).all().map(x=>x.tagId):db.select().from(caseTags).where(eq(caseTags.caseId,resourceId)).all().map(x=>x.tagId);return linked.length?db.select().from(tags).where(inArray(tags.id,linked)).all():[];};
r.get('/tags',async ctx=>{const a=await actor(ctx);const scope=String(ctx.query.scope??'active');if(!['active','all'].includes(scope))bad('Invalid scope');if(scope==='all')taxonomyEditor(a);ctx.body=db.select().from(tags).where(scope==='all'?undefined:eq(tags.active,true)).orderBy(tags.sortOrder,tags.name).all();});
function tagSlugAvailable(slug:string,excludeId?:string){const found=db.select().from(tags).where(eq(tags.slug,slug)).get();if(found&&found.id!==excludeId)bad('Tag slug already exists',409);}
function tagNameAvailable(name:string,excludeId?:string){const found=db.select().from(tags).where(eq(tags.name,name)).get();if(found&&found.id!==excludeId)bad('Tag name already exists',409);}
r.post('/tags',async ctx=>{const a=await actor(ctx);taxonomyEditor(a);const d=tagInput.parse(ctx.request.body);tagSlugAvailable(d.slug);tagNameAvailable(d.name);const entry={id:id(),...d};db.insert(tags).values(entry).run();audit(a,'create','tag',entry.id);ctx.status=201;ctx.body=entry;});
r.patch('/tags/:id',async ctx=>{const a=await actor(ctx);taxonomyEditor(a);const d=tagInput.partial().parse(ctx.request.body);const item=db.select().from(tags).where(eq(tags.id,ctx.params.id)).get();if(!item)bad('Not found',404);if(d.slug)tagSlugAvailable(d.slug,item.id);if(d.name)tagNameAvailable(d.name,item.id);db.update(tags).set(d).where(eq(tags.id,item.id)).run();audit(a,'update','tag',item.id);ctx.body=db.select().from(tags).where(eq(tags.id,item.id)).get();});
r.delete('/tags/:id',async ctx=>{const a=await actor(ctx);taxonomyEditor(a);const item=db.select().from(tags).where(eq(tags.id,ctx.params.id)).get();if(!item)bad('Not found',404);const referenced=!!(db.select().from(requirementTags).where(eq(requirementTags.tagId,item.id)).get()||db.select().from(caseTags).where(eq(caseTags.tagId,item.id)).get());if(referenced)db.update(tags).set({active:false}).where(eq(tags.id,item.id)).run();else db.delete(tags).where(eq(tags.id,item.id)).run();audit(a,referenced?'deactivate':'delete','tag',item.id);ctx.body={ok:true,active:referenced?false:undefined};});
// File associations are private by default; approval belongs to a specific case.
const fileInfo=(f:typeof files.$inferSelect)=>({id:f.id,name:f.name,purpose:f.purpose,mimeType:f.mimeType,size:f.size,url:`/api/files/${f.id}/download`});
function filesFor(kind:'requirement'|'case',resourceId:string,approvedOnly=false){
  if(kind==='requirement')return db.select().from(requirementFiles).innerJoin(files,eq(requirementFiles.fileId,files.id)).where(eq(requirementFiles.requirementId,resourceId)).all().map(x=>fileInfo(x.files));
  return db.select().from(caseFiles).innerJoin(files,eq(caseFiles.fileId,files.id)).where(and(eq(caseFiles.caseId,resourceId),approvedOnly?eq(caseFiles.approved,true):undefined)).all().map(x=>({...fileInfo(x.files),approved:x.case_files.approved}));
}
function validateFileLinks(ids:string[],a:Actor,reqId?:string){
  const existing=reqId?filesFor('requirement',reqId).map(f=>f.id):[];
  for(const fileId of ids){const f=db.select().from(files).where(eq(files.id,fileId)).get();if(!f||(f.ownerId!==a.id&&!existing.includes(fileId)))bad('Invalid file reference');}
}
function nextRequirementCode(){const max=db.select({code:requirements.requirementCode}).from(requirements).all().reduce((n,r)=>Math.max(n,Number(r.code?.slice(8))||0),0);return 'MED-REQ-'+String(max+1).padStart(4,'0');}
function bumpVersion(version:string){const parts=version.slice(1).split('.').map(Number);parts[parts.length-1]++;return 'v'+parts.join('.');}
function downloadable(ctx:Koa.Context,name:string,type:string){ctx.type=type;ctx.set('Content-Disposition',`attachment; filename="download${path.extname(name).replace(/[^.a-z0-9]/gi,'')}"; filename*=UTF-8''${encodeURIComponent(name)}`);ctx.set('Cache-Control','private, no-store');ctx.set('X-Content-Type-Options','nosniff');ctx.set('Content-Security-Policy',"default-src 'none'; sandbox");}
const allowedFileTypes:Record<string,string>={'.md':'text/markdown','.txt':'text/plain','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv','.json':'application/json','.zip':'application/zip','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
r.post('/files',async ctx=>{
  const a=await actor(ctx);const raw=(ctx.request as any).files?.file;const f=Array.isArray(raw)?raw[0]:raw;if(!f)bad('file field is required');
  const name=path.basename(String(f.originalFilename??'').replace(/\\/g,'/')).replace(/[\u0000-\u001f\u007f]/g,'').normalize('NFC');
  if(!name||name.length>180)bad('Invalid filename');const ext=path.extname(name).toLowerCase(),mime=allowedFileTypes[ext];if(!mime)bad('Unsupported file extension');
  const purpose=z.enum(['reference','agent','data','other']).parse((ctx.request.body as any)?.purpose??'reference');
  let bytes:Buffer=fs.readFileSync(f.filepath);if(!bytes.length||bytes.length>20*1024*1024)bad('File must be between 1 byte and 20 MB');
  if(bytes.subarray(0,2).toString()==='MZ'||bytes.subarray(0,4).equals(Buffer.from([127,69,76,70])))bad('Executable content is not allowed');
  if(['.docx','.xlsx','.zip'].includes(ext)&&!bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])))bad('Invalid ZIP/Office signature');
  if(ext==='.pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')bad('Invalid PDF signature');
  if(['.md','.txt','.csv','.json'].includes(ext)){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{bad('Text files must use UTF-8');}if(bytes.includes(0))bad('Invalid text content');if(ext==='.json'){try{JSON.parse(bytes.toString('utf8'));}catch{bad('Invalid JSON');}}}
  if(mime.startsWith('image/')){const meta=await sharp(bytes).metadata().catch(()=>null);if(!meta||!['jpeg','png','webp'].includes(meta.format??'')||!meta.width||!meta.height||meta.width*meta.height>35000000)bad('Invalid image');bytes=await sharp(bytes).rotate().toFormat(ext==='.jpg'||ext==='.jpeg'?'jpeg':ext.slice(1) as 'png'|'webp').toBuffer();}
  if(bytes.length>20*1024*1024)bad('Processed image exceeds 20 MB',413);const fileId=id(),storageKey=fileId+ext;fs.writeFileSync(path.join(storage,storageKey),bytes,{flag:'wx'});
  try{db.insert(files).values({id:fileId,ownerId:a.id,storageKey,name,purpose,mimeType:mime,size:bytes.length,createdAt:now()}).run();}catch(e){fs.rmSync(path.join(storage,storageKey),{force:true});throw e;}
  audit(a,'upload','file',fileId);ctx.status=201;ctx.body=fileInfo(db.select().from(files).where(eq(files.id,fileId)).get()!);
});
r.get('/files/:id/download',async ctx=>{
  const a=await actor(ctx),f=db.select().from(files).where(eq(files.id,ctx.params.id)).get();if(!f)bad('Not found',404);
  const ownedRequirement=db.select().from(requirementFiles).innerJoin(requirements,eq(requirementFiles.requirementId,requirements.id)).where(and(eq(requirementFiles.fileId,f.id),eq(requirements.userId,a.id))).get();
  const approvedCase=db.select().from(caseFiles).innerJoin(cases,eq(caseFiles.caseId,cases.id)).where(and(eq(caseFiles.fileId,f.id),eq(caseFiles.approved,true),eq(cases.status,'published'))).get();
  if(f.ownerId!==a.id&&!manager(a)&&!ownedRequirement&&!approvedCase)bad('Forbidden',403);
  const location=path.join(storage,path.basename(f.storageKey));if(!fs.existsSync(location))bad('File unavailable',404);downloadable(ctx,f.name,f.mimeType);audit(a,'download','file',f.id);ctx.body=fs.createReadStream(location);
});
// Explicit per-case review, independent of approval on any other case.
r.put('/cases/:id/files',async ctx=>{
  const a=await actor(ctx);admin(a);const c=caseDetail(ctx.params.id,a);const d=z.object({files:z.array(z.object({id:z.string(),approved:z.boolean()})).max(10)}).parse(ctx.request.body);
  if(new Set(d.files.map(f=>f.id)).size!==d.files.length)bad('Duplicate file');const source=c.requirementId?filesFor('requirement',c.requirementId).map(f=>f.id):[];const current=filesFor('case',c.id).map(f=>f.id);
  for(const item of d.files){const f=db.select().from(files).where(eq(files.id,item.id)).get();if(!f||!(f.ownerId===a.id||source.includes(f.id)||current.includes(f.id)))bad('Invalid file reference');}
  db.transaction(tx=>{tx.delete(caseFiles).where(eq(caseFiles.caseId,c.id)).run();d.files.forEach(f=>tx.insert(caseFiles).values({caseId:c.id,fileId:f.id,approved:f.approved}).run());});audit(a,'review-files','case',c.id);ctx.body=filesFor('case',c.id);
});
function aiDocument(item:{title:string;requirementCode?:string|null;contentVersion:string;content:string;expectedOutcome?:string|null;industry?:string|null;department?:string|null}){
  return `# ${item.title}\n\n需求编号：${item.requirementCode??'待补充'}\n内容版本：${item.contentVersion}\n行业：${item.industry||'待补充'}\n部门：${item.department||'待补充'}\n\n## 平台需求正文（参考材料）\n\n${item.content||'待补充'}\n\n## 预期效果（提交者描述）\n\n${item.expectedOutcome||'待补充，参见正文'}\n\n## 阅读边界\n\n以上是参考资料或提交者的描述，不代表接手企业已确认事实。背景、业务痛点、核心需求、预期效果与范围边界如未在正文明确，均待补充。详细 Agent 材料请单独下载。\n\n### 已确认事实与来源\n待结合当前企业资料核实。\n\n### 假设\n待确认，不将预期收益当作事实。\n\n### 待确认事项\n实际场景、责任、数据来源、业务规则和边界待确认。\n\n### 候选方案\n待讨论；不预设工具、流程或 MVP。\n`;
}
r.get('/requirements/:id/download',async ctx=>{const a=await actor(ctx),v=db.select().from(requirements).where(eq(requirements.id,ctx.params.id)).get();if(!v||(v.userId!==a.id&&!manager(a)))bad('Not found',404);const ai=ctx.query.format==='ai';downloadable(ctx,`${v.requirementCode}-${v.contentVersion}${ai?'-AI':''}.md`,'text/markdown; charset=utf-8');audit(a,'download'+(ai?'-ai':''),'requirement',v.id);ctx.body=ai?aiDocument(v):v.content;});
r.get('/cases/:id/download',async ctx=>{const a=await actor(ctx),c=caseDetail(ctx.params.id,a);const content=c.publicContent??c.prompts.find(p=>p.type==='requirement')?.content??c.summary;downloadable(ctx,`${c.requirementCode??'CASE-'+c.id}-${c.contentVersion}-AI.md`,'text/markdown; charset=utf-8');audit(a,'download-ai','case',c.id);ctx.body=aiDocument({...c,content});});

const fileIdsInput=z.array(z.string()).max(10).refine(v=>new Set(v).size===v.length,'Duplicate file');
const reqSchema=z.object({coverMediaId:z.string().nullable().optional(),requirementCode:z.string().regex(/^MED-REQ-[0-9]{4,10}$/).optional(),contentVersion:z.string().regex(/^v[0-9]+(?:\.[0-9]+){0,2}$/).max(30).optional(),fileIds:fileIdsInput.default([]),title:z.string().min(2).max(180),content:z.string().min(5).max(40000),categoryId:z.string().nullable().optional(),industry:z.string().max(60).nullable().optional(),department:z.string().max(60).nullable().optional(),difficulty:z.enum(['easy','medium','hard']).nullable().optional(),implementationStatus:z.enum(['pending','building','completed','verified']).optional(),expectedOutcome:z.string().max(3000).nullable().optional(),tagIds:tagIds,shareConsent:z.boolean().default(false),mediaIds:z.array(z.string()).max(10).default([])});
const newRequirementSchema=reqSchema.extend({categoryId:z.string().min(1),industry:z.string().max(60).nullable().optional().refine(value=>!value||value.split(/[、,，/]/).every(item=>['药品','医疗器械','医药服务','IVD'].includes(item.trim())))});
function validateMediaLinks(ids:string[],a:Actor,reqId?:string){
  if(new Set(ids).size!==ids.length)bad('Duplicate image reference');
  const linked=reqId?db.select().from(requirementMedia).where(eq(requirementMedia.requirementId,reqId)).all().map(x=>x.mediaId):[];
  for(const mediaId of ids){const image=db.select().from(media).where(eq(media.id,mediaId)).get();if(!image||!(image.ownerId===a.id||linked.includes(mediaId)))bad('Invalid image reference');}
}
function validateCover(coverId:string|null|undefined,ids:string[]){if(coverId&&!ids.includes(coverId))bad('Cover must be a linked image');}
const reqPhotos=(reqId:string)=>db.select().from(requirementMedia).where(eq(requirementMedia.requirementId,reqId)).orderBy(requirementMedia.sortOrder,requirementMedia.mediaId).all().map(j=>({id:j.mediaId,url:`/api/media/${j.mediaId}/content`}));
const casePhotos=(caseId:string,a:Actor)=>db.select().from(caseMedia).innerJoin(media,eq(caseMedia.mediaId,media.id)).where(and(eq(caseMedia.caseId,caseId),manager(a)?undefined:eq(media.status,'approved'))).orderBy(caseMedia.sortOrder,caseMedia.mediaId).all().map(j=>({id:j.media.id,url:`/api/media/${j.media.id}/content`}));

// Preserve review decisions and submission actions independently of draft saves.
const reqHistory=(reqId:string)=>({
 reviews:db.select().from(reviews).where(eq(reviews.requirementId,reqId)).orderBy(desc(reviews.createdAt),sql`rowid DESC`).all(),
 submissions:db.select({id:auditLogs.id,actorId:auditLogs.actorId,createdAt:auditLogs.createdAt}).from(auditLogs).where(and(eq(auditLogs.resourceType,'requirement'),eq(auditLogs.resourceId,reqId),eq(auditLogs.action,'resubmit'))).orderBy(desc(auditLogs.createdAt),sql`rowid DESC`).all()
});
r.post('/requirements',async ctx=>{const a=await actor(ctx);const d=newRequirementSchema.parse(ctx.request.body);if(!db.select().from(categories).where(eq(categories.id,d.categoryId)).get())bad('Invalid category');validateMediaLinks(d.mediaIds,a);validateCover(d.coverMediaId,d.mediaIds);validateTags(d.tagIds);validateFileLinks(d.fileIds,a);const reqId=id();if(d.requirementCode&&db.select().from(requirements).where(eq(requirements.requirementCode,d.requirementCode)).get())bad('Requirement code already exists',409);db.transaction(tx=>{tx.insert(requirements).values({id:reqId,userId:a.id,title:d.title,content:d.content,requirementCode:d.requirementCode??nextRequirementCode(),contentVersion:d.contentVersion??'v1.0',coverMediaId:d.coverMediaId??d.mediaIds[0]??null,categoryId:d.categoryId,industry:d.industry??null,department:d.department??null,difficulty:d.difficulty??null,implementationStatus:d.implementationStatus??'pending',expectedOutcome:d.expectedOutcome??null,shareConsent:d.shareConsent,createdAt:now()}).run();d.fileIds.forEach(fileId=>tx.insert(requirementFiles).values({requirementId:reqId,fileId}).run());d.mediaIds.forEach((mediaId,i)=>tx.insert(requirementMedia).values({requirementId:reqId,mediaId,sortOrder:i}).run());d.tagIds.forEach(tagId=>tx.insert(requirementTags).values({requirementId:reqId,tagId}).run());});ctx.status=201;ctx.body={id:reqId,status:'submitted',requirementCode:db.select().from(requirements).where(eq(requirements.id,reqId)).get()!.requirementCode,contentVersion:d.contentVersion??'v1.0'};});
r.get('/requirements/:id',async ctx=>{const a=await actor(ctx);const v=db.select().from(requirements).where(eq(requirements.id,ctx.params.id)).get();if(!v||(v.userId!==a.id&&!manager(a)))bad('Not found',404);ctx.body={...v,images:reqPhotos(v.id),files:filesFor('requirement',v.id),tags:tagsFor('requirement',v.id),...reqHistory(v.id)};});
r.patch('/requirements/:id',async ctx=>{
 const a=await actor(ctx);const v=db.select().from(requirements).where(eq(requirements.id,ctx.params.id)).get();
 if(!v||(v.userId!==a.id&&!manager(a)))bad('Not found',404);
 if(!manager(a)&&!['submitted','rejected'].includes(v.status))bad('已发布或当前状态的需求不可修改',409);
 const d=reqSchema.omit({requirementCode:true}).partial().parse(ctx.request.body);
 if(d.shareConsent!==undefined&&v.userId!==a.id)bad('Only author may change sharing consent',403);
 if(d.fileIds)validateFileLinks(d.fileIds,a,v.id);
 if(d.tagIds)validateTags(d.tagIds,tagsFor('requirement',v.id).map(t=>t.id));if(d.mediaIds)validateMediaLinks(d.mediaIds,a,v.id);
 const {tagIds:replacementTags,mediaIds:replacementMedia,fileIds:replacementFiles,...fields}=d;
 const linkedImages=replacementMedia??reqPhotos(v.id).map(im=>im.id);validateCover(fields.coverMediaId,linkedImages);if(replacementMedia&&fields.coverMediaId===undefined)fields.coverMediaId=linkedImages.includes(v.coverMediaId??'')?v.coverMediaId:linkedImages[0]??null;
 if(fields.content!==undefined&&fields.content!==v.content&&!fields.contentVersion)fields.contentVersion=bumpVersion(v.contentVersion);
 db.transaction(tx=>{
  if(Object.keys(fields).length)tx.update(requirements).set(fields).where(eq(requirements.id,v.id)).run();
  if(replacementTags){tx.delete(requirementTags).where(eq(requirementTags.requirementId,v.id)).run();replacementTags.forEach(tagId=>tx.insert(requirementTags).values({requirementId:v.id,tagId}).run());}
  if(replacementMedia){tx.delete(requirementMedia).where(eq(requirementMedia.requirementId,v.id)).run();replacementMedia.forEach((mediaId,i)=>tx.insert(requirementMedia).values({requirementId:v.id,mediaId,sortOrder:i}).run());}
  if(replacementFiles){tx.delete(requirementFiles).where(eq(requirementFiles.requirementId,v.id)).run();replacementFiles.forEach(fileId=>tx.insert(requirementFiles).values({requirementId:v.id,fileId}).run());}
  audit(a,'update','requirement',v.id);
 });ctx.body={ok:true,status:v.status};
});
r.post('/requirements/:id/resubmit',async ctx=>{
 const a=await actor(ctx);const v=db.select().from(requirements).where(eq(requirements.id,ctx.params.id)).get();
 if(!v||(v.userId!==a.id&&!manager(a)))bad('Not found',404);
 db.transaction(tx=>{
  const changed=tx.update(requirements).set({status:'submitted'}).where(and(eq(requirements.id,v.id),eq(requirements.status,'rejected'))).run();
  if(!changed.changes)bad('仅已退回的需求可以重新提交，请刷新状态',409);
  audit(a,'resubmit','requirement',v.id);
 });ctx.body={ok:true,status:'submitted'};
});
const storage=config.uploads;fs.mkdirSync(storage,{recursive:true});
r.post('/media',async ctx=>{const a=await actor(ctx);const raw=(ctx.request as any).files?.file;const file=Array.isArray(raw)?raw[0]:raw;if(!file)bad('file field is required');const bytes=fs.readFileSync(file.filepath);if(bytes.length>(Number(process.env.MAX_IMAGE_MB)||10)*1024*1024)bad('Image size limit exceeded',413);const meta=await sharp(bytes).metadata().catch(()=>null);if(!meta||!['jpeg','png','webp'].includes(meta.format??'')||!meta.width||!meta.height||meta.width*meta.height>35000000)bad('Invalid image format or dimensions');const output=await sharp(bytes).rotate().resize({width:2400,withoutEnlargement:true}).webp({quality:82}).toBuffer();const mediaId=id(),filename=`${mediaId}.webp`;fs.writeFileSync(path.join(storage,filename),output,{flag:'wx'});db.insert(media).values({id:mediaId,ownerId:a.id,storageKey:filename,mimeType:'image/webp',size:output.length,createdAt:now()}).run();ctx.status=201;ctx.body={id:mediaId,url:`/api/media/${mediaId}/content`};});
r.get('/media/:id/content',async ctx=>{const a=await actor(ctx);const m=db.select().from(media).where(eq(media.id,ctx.params.id)).get();if(!m)bad('Not found',404);const ownedRequirement=db.select().from(requirementMedia).innerJoin(requirements,eq(requirementMedia.requirementId,requirements.id)).where(and(eq(requirementMedia.mediaId,m.id),eq(requirements.userId,a.id))).get();const authorized=m.ownerId===a.id||manager(a)||ownedRequirement||db.select().from(caseMedia).innerJoin(cases,eq(caseMedia.caseId,cases.id)).where(and(eq(caseMedia.mediaId,m.id),eq(cases.status,'published'))).get();if(!authorized || (m.ownerId!==a.id && !manager(a) && !ownedRequirement && m.status!=='approved'))bad('Forbidden',403);ctx.type=m.mimeType;ctx.set('Cache-Control','private, no-store');ctx.body=fs.createReadStream(path.join(storage,path.basename(m.storageKey)));});
function caseDetail(caseId:string,a:Actor){const c=db.select().from(cases).where(eq(cases.id,caseId)).get();if(!c||(c.status!=='published'&&!manager(a)))bad('Not found',404);const prompts=db.select().from(casePrompts).where(eq(casePrompts.caseId,c.id)).all();const images=casePhotos(c.id,a);return {...c,coverMediaId:images.some(im=>im.id===c.coverMediaId)?c.coverMediaId:images[0]?.id??null,prompts,images,files:filesFor('case',c.id,!manager(a)),tags:tagsFor('case',c.id)};}
r.put('/cases/:id/images',async ctx=>{
  const a=await actor(ctx);admin(a);const c=caseDetail(ctx.params.id,a);
  const d=z.object({mediaIds:z.array(z.string()).max(10).refine(v=>new Set(v).size===v.length,'Duplicate image'),coverMediaId:z.string().nullable().optional()}).parse(ctx.request.body);
  const allowed=new Set([...c.images.map(im=>im.id),...(c.requirementId?reqPhotos(c.requirementId).map(im=>im.id):[])]);
  for(const mediaId of d.mediaIds){const image=db.select().from(media).where(eq(media.id,mediaId)).get();if(!image||!(image.ownerId===a.id||allowed.has(mediaId)))bad('Invalid image reference');}
  validateCover(d.coverMediaId,d.mediaIds);
  if(c.status==='published'&&c.requirementId){const source=db.select().from(requirements).where(eq(requirements.id,c.requirementId)).get();if(!source?.shareConsent)bad('Sharing consent required',409);}
  db.transaction(tx=>{tx.delete(caseMedia).where(eq(caseMedia.caseId,c.id)).run();d.mediaIds.forEach((mediaId,sortOrder)=>{tx.update(media).set({status:'approved'}).where(eq(media.id,mediaId)).run();tx.insert(caseMedia).values({caseId:c.id,mediaId,sortOrder}).run();});tx.update(cases).set({coverMediaId:d.coverMediaId??d.mediaIds[0]??null}).where(eq(cases.id,c.id)).run();});
  audit(a,'review-images','case',c.id);ctx.body=caseDetail(c.id,a);
});
r.get('/cases/:id',async ctx=>{const a=await actor(ctx);ctx.body=caseDetail(ctx.params.id,a);});
r.get('/cases/:id/comments',async ctx=>{const a=await actor(ctx);const c=caseDetail(ctx.params.id,a);const rows=db.select().from(caseComments).where(eq(caseComments.caseId,c.id)).orderBy(caseComments.createdAt).limit(100).all();ctx.body=rows.filter(x=>x.status!=='hidden'||manager(a)).map(x=>({id:x.id,content:x.content,status:x.status,createdAt:x.createdAt,authorLabel:'用户'}));});
r.post('/cases/:id/comments',async ctx=>{const a=await actor(ctx);const c=caseDetail(ctx.params.id,a);const d=z.object({content:z.string().trim().min(2).max(2000)}).parse(ctx.request.body);const comment={id:id(),caseId:c.id,userId:a.id,content:d.content,status:'pending',createdAt:now()};db.insert(caseComments).values(comment).run();ctx.status=201;ctx.body={id:comment.id,content:comment.content,status:comment.status,createdAt:comment.createdAt,authorLabel:'用户'};});
r.get('/comments',async ctx=>{const a=await actor(ctx);admin(a);ctx.body=db.select({id:caseComments.id,caseId:caseComments.caseId,userId:caseComments.userId,content:caseComments.content,status:caseComments.status,createdAt:caseComments.createdAt,caseTitle:cases.title}).from(caseComments).innerJoin(cases,eq(cases.id,caseComments.caseId)).orderBy(desc(caseComments.createdAt)).limit(300).all();});
r.patch('/comments/:id/moderation',async ctx=>{const a=await actor(ctx);admin(a);const d=z.object({status:z.enum(['approved','hidden'])}).parse(ctx.request.body);const item=db.select().from(caseComments).where(eq(caseComments.id,ctx.params.id)).get();if(!item)bad('Not found',404);db.update(caseComments).set({status:d.status}).where(eq(caseComments.id,item.id)).run();audit(a,'comment:'+d.status,'comment',item.id);ctx.body={ok:true};});
r.post('/cases',async ctx=>{const a=await actor(ctx);admin(a);const d=z.object({title:z.string().min(2),summary:z.string().min(5),categoryId:z.string().nullable().optional(),industry:z.string().optional(),department:z.string().optional(),difficulty:z.enum(['easy','medium','hard']).optional(),implementationStatus:z.enum(['pending','building','completed','verified']).default('pending'),tagIds:tagIds,requirementId:z.string().nullable().optional(),requirementPrompt:z.string().default(''),buildPrompt:z.string().default('')}).parse(ctx.request.body);validateTags(d.tagIds);const caseId=id();db.transaction(tx=>{tx.insert(cases).values({id:caseId,title:d.title,summary:d.summary,publicContent:d.requirementPrompt||d.summary,categoryId:d.categoryId??null,industry:d.industry??null,department:d.department??null,difficulty:d.difficulty??null,implementationStatus:d.implementationStatus,requirementId:d.requirementId??null,createdAt:now()}).run();d.tagIds.forEach(tagId=>tx.insert(caseTags).values({caseId,tagId}).run());for(const [type,content] of [['requirement',d.requirementPrompt],['build',d.buildPrompt]])tx.insert(casePrompts).values({id:id(),caseId,type,content}).run();});audit(a,'create','case',caseId);ctx.status=201;ctx.body=caseDetail(caseId,a);});
r.patch('/cases/:id',async ctx=>{const a=await actor(ctx);admin(a);const c=caseDetail(ctx.params.id,a);const d=z.object({title:z.string().min(2).optional(),summary:z.string().min(5).optional(),requirementPrompt:z.string().optional(),buildPrompt:z.string().optional(),categoryId:z.string().nullable().optional(),industry:z.string().nullable().optional(),department:z.string().nullable().optional(),difficulty:z.enum(['easy','medium','hard']).nullable().optional(),implementationStatus:z.enum(['pending','building','completed','verified']).optional(),tagIds:tagIds.optional()}).parse(ctx.request.body);if(d.tagIds)validateTags(d.tagIds);db.transaction(tx=>{tx.update(cases).set({...(d.requirementPrompt!==undefined?{publicContent:d.requirementPrompt,contentVersion:d.requirementPrompt!==(c.publicContent??'')?bumpVersion(c.contentVersion):c.contentVersion}:{}),...(d.title?{title:d.title}:{}),...(d.summary?{summary:d.summary}:{}),...(d.categoryId!==undefined?{categoryId:d.categoryId}:{}),...(d.industry!==undefined?{industry:d.industry}:{}),...(d.department!==undefined?{department:d.department}:{}),...(d.difficulty!==undefined?{difficulty:d.difficulty}:{}),...(d.implementationStatus?{implementationStatus:d.implementationStatus}:{})}).where(eq(cases.id,c.id)).run();if(d.tagIds){tx.delete(caseTags).where(eq(caseTags.caseId,c.id)).run();d.tagIds.forEach(tagId=>tx.insert(caseTags).values({caseId:c.id,tagId}).run());}for(const [type,value] of [['requirement',d.requirementPrompt],['build',d.buildPrompt]] as const){if(value!==undefined)tx.update(casePrompts).set({content:value}).where(and(eq(casePrompts.caseId,c.id),eq(casePrompts.type,type))).run();}});audit(a,'update','case',c.id);ctx.body=caseDetail(c.id,a);});
r.post('/requirements/:id/review',async ctx=>{const a=await actor(ctx);admin(a);const req=db.select().from(requirements).where(eq(requirements.id,ctx.params.id)).get();if(!req)bad('Not found',404);const d=z.object({approvedFileIds:fileIdsInput.default([]),decision:z.enum(['approve','reject']),notes:z.string().trim().max(3000).default(''),force:z.boolean().default(false),forceReason:z.string().trim().max(2000).default(''),title:z.string().min(2).optional(),summary:z.string().min(5).optional(),requirementPrompt:z.string().optional(),buildPrompt:z.string().optional(),approvedMediaIds:z.array(z.string()).default([])}).parse(ctx.request.body);if(d.decision==='reject'&&!d.notes)bad('请填写具体退回原因');if(d.force&&!['admin','super_admin'].includes(a.role))bad('Forbidden',403);if(d.force&&(d.decision!=='approve'||req.shareConsent))bad('Force is only available to approve private requirements');if(d.force&&!d.forceReason)bad('请填写强制公开理由');if(d.decision==='approve'&&!req.shareConsent&&!d.force)bad('Sharing consent required',409);const originals=db.select().from(requirementMedia).where(eq(requirementMedia.requirementId,req.id)).all().map(x=>x.mediaId);if(d.approvedMediaIds.some(x=>!originals.includes(x)))bad('Only linked images can be approved');const linkedFiles=filesFor('requirement',req.id).map(f=>f.id);if(d.approvedFileIds.some(f=>!linkedFiles.includes(f)))bad('Only linked files can be approved');const caseId=id();const reviewNotes=d.force?`【强制公开覆盖共享授权】${d.forceReason}${d.notes?`\n${d.notes}`:''}`:d.notes;db.transaction(tx=>{const changed=tx.update(requirements).set({status:d.decision==='approve'?'published':'rejected'}).where(and(eq(requirements.id,req.id),eq(requirements.status,'submitted'))).run();if(!changed.changes)bad('仅待审核的需求可以审核，请刷新状态',409);tx.insert(reviews).values({id:id(),requirementId:req.id,reviewerId:a.id,decision:d.decision,notes:reviewNotes,createdAt:now()}).run();if(d.decision==='approve'){tx.insert(cases).values({id:caseId,requirementId:req.id,requirementCode:req.requirementCode,contentVersion:req.contentVersion,coverMediaId:d.approvedMediaIds.includes(req.coverMediaId??'')?req.coverMediaId:d.approvedMediaIds[0]??null,publicContent:d.requirementPrompt??d.summary??'待补充',title:d.title??req.title,summary:d.summary??req.content.slice(0,220),categoryId:req.categoryId,industry:req.industry,department:req.department,difficulty:req.difficulty,implementationStatus:req.implementationStatus,status:'published',publishedAt:now(),createdAt:now()}).run();for(const [type,content] of [['requirement',d.requirementPrompt??''],['build',d.buildPrompt??'']])tx.insert(casePrompts).values({id:id(),caseId,type,content}).run();tx.select().from(requirementTags).where(eq(requirementTags.requirementId,req.id)).all().forEach(t=>tx.insert(caseTags).values({caseId,tagId:t.tagId}).run());d.approvedFileIds.forEach(fileId=>tx.insert(caseFiles).values({caseId,fileId,approved:true}).run());d.approvedMediaIds.forEach((mediaId,i)=>{tx.update(media).set({status:'approved'}).where(eq(media.id,mediaId)).run();tx.insert(caseMedia).values({caseId,mediaId,sortOrder:i}).run();});}});audit(a,d.force?'force-approve':'approve','requirement',req.id);ctx.body={ok:true,caseId:d.decision==='approve'?caseId:null};});
r.post('/cases/:id/status',async ctx=>{const a=await actor(ctx);admin(a);const c=db.select().from(cases).where(eq(cases.id,ctx.params.id)).get();if(!c)bad('Not found',404);const d=z.object({status:z.enum(['published','draft','archived'])}).parse(ctx.request.body);if(d.status==='published'&&c.requirementId){const source=db.select().from(requirements).where(eq(requirements.id,c.requirementId)).get();const forced=db.select().from(auditLogs).where(and(eq(auditLogs.resourceType,'requirement'),eq(auditLogs.resourceId,c.requirementId),eq(auditLogs.action,'force-approve'))).get();if(!source?.shareConsent&&!forced)bad('Sharing consent required',409);}db.update(cases).set({status:d.status,publishedAt:d.status==='published'?now():c.publishedAt}).where(eq(cases.id,c.id)).run();audit(a,'status:'+d.status,'case',c.id);ctx.body={ok:true};});
r.post('/cases/:id/copy-events',async ctx=>{const a=await actor(ctx);const c=caseDetail(ctx.params.id,a);const d=z.object({type:z.enum(['copy_requirement','copy_build'])}).parse(ctx.request.body);db.insert(caseEvents).values({id:id(),caseId:c.id,userId:a.id,type:d.type,createdAt:now()}).run();ctx.body={ok:true};});
registerUserRoutes(r,{actor,bad,id,now});
r.get('/stats',async ctx=>{const a=await actor(ctx);admin(a);ctx.body={users:db.select({total:count()}).from(users).get()!.total,requirements:db.select({total:count()}).from(requirements).get()!.total,cases:db.select({total:count()}).from(cases).get()!.total,pending:db.select({total:count()}).from(requirements).where(eq(requirements.status,'submitted')).get()!.total};});
r.get('/audit-logs',async ctx=>{const a=await actor(ctx);admin(a);ctx.body=db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200).all();});
app.use(r.routes()).use(r.allowedMethods());
const port=Number(process.env.PORT??3001);app.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`jack-case API http://localhost:${port}`));
