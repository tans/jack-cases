import type Router from '@koa/router';
import { and,asc,count,desc,eq,inArray,or,sql,type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db,sqlite } from './db.js';
import { users,requirements,cases,media,categories,tags,requirementTags,caseTags,caseMedia,requirementMedia,files,requirementFiles,reviews,auditLogs } from './schema.js';
import { pagination,paginationShape,pageResponse } from './pagination.js';

type Actor={id:string;role:string;email:string};
const text=z.string().trim().max(200);
const filters={q:text.optional(),categoryId:text.optional(),industry:text.optional(),difficulty:z.enum(['easy','medium','hard']).optional(),implementationStatus:z.enum(['pending','building','completed','verified']).optional(),tagIds:z.string().max(2400).transform(v=>v.split(',')).refine(v=>v.length<=12&&v.every(Boolean)&&new Set(v).size===v.length,'Expected 1–12 distinct tag IDs').optional()};
const caseQuery=z.object({...paginationShape,...filters,scope:z.enum(['published','all']).default('published'),status:z.enum(['published','draft','archived']).optional()}).strict();
const reqQuery=z.object({...paginationShape,...filters,scope:z.enum(['mine','all']).default('mine'),category:text.optional(),status:z.enum(['submitted','published','rejected','draft']).optional(),consent:z.enum(['authorized','private']).optional()}).strict();
const fileQuery=z.object({...paginationShape,scope:z.enum(['mine','all']).default('mine'),q:text.optional(),purpose:z.enum(['reference','agent','data','other']).optional()}).strict();
const simpleQuery=z.object(paginationShape).strict();
// Deterministic scalar helpers preserve the existing legacy category and multi-industry UI semantics.
// SQLite still performs filtering/grouping/counting before limit/offset; no full records leave SQL.
sqlite.function('embedded_category',{deterministic:true},(content:unknown)=>String(content).match(/(?:^|\n)\s*业务分类\s*[：:]\s*([^\n]+)/)?.[1]?.trim()??'');
sqlite.function('has_industry',{deterministic:true},(value:unknown,selected:unknown)=>String(value??'').split(/[、,，/]/).map(x=>x.trim()).includes(String(selected))?1:0);
const categoryName=sql<string>`coalesce((select name from categories where id=${requirements.categoryId}),nullif(embedded_category(${requirements.content}),''),'未分类')`;
const order=(table:typeof cases|typeof requirements|typeof media|typeof users|typeof files,sort:string)=>sort==='oldest'?[asc(table.createdAt),asc(table.id)]:[desc(table.createdAt),desc(table.id)];
function categoryTree(id:string){
  const rows=db.select({id:categories.id,parentId:categories.parentId}).from(categories).all();
  const ids=new Set([id]);let size=0;
  while(size!==ids.size){size=ids.size;for(const c of rows)if(c.parentId&&ids.has(c.parentId))ids.add(c.id);}
  return [...ids];
}
function commonWhere(table:typeof cases|typeof requirements,d:z.infer<typeof caseQuery>|z.infer<typeof reqQuery>){
  const conditions:SQL[]=[];
  if(d.categoryId)conditions.push(inArray(table.categoryId,categoryTree(d.categoryId)));
  if(d.industry)conditions.push(sql`has_industry(${table.industry},${d.industry})=1`);
  if(d.difficulty)conditions.push(eq(table.difficulty,d.difficulty));
  if(d.implementationStatus)conditions.push(eq(table.implementationStatus,d.implementationStatus));
  if(d.status)conditions.push(eq(table.status,d.status));
  if(d.q){const columns=table===cases?[cases.title,cases.summary,cases.industry]:[requirements.title,requirements.content,requirements.expectedOutcome,requirements.industry,requirements.department,categoryName];conditions.push(or(...columns.map(col=>sql`instr(lower(coalesce(${col},'')),lower(${d.q}))>0`))!);}
  if(d.tagIds){const relation=table===cases?caseTags:requirementTags;const resource=table===cases?caseTags.caseId:requirementTags.requirementId;conditions.push(sql`exists (select 1 from ${relation} where ${resource}=${table.id} and ${inArray(relation.tagId,d.tagIds)})`);}
  return conditions;
}
function pageTags(type:'case'|'requirement',ids:string[]){
  const grouped=new Map<string,(typeof tags.$inferSelect)[]>();if(!ids.length)return grouped;
  const relation=type==='case'?caseTags:requirementTags;const resource=type==='case'?caseTags.caseId:requirementTags.requirementId;
  const rows=db.select({resource,tag:tags}).from(relation).innerJoin(tags,eq(relation.tagId,tags.id)).where(inArray(resource,ids)).orderBy(tags.sortOrder,tags.name,tags.id).all();
  for(const row of rows){const list=grouped.get(row.resource)??[];list.push(row.tag);grouped.set(row.resource,list);}return grouped;
}
function pageCaseImages(ids:string[],a:Actor){
  const grouped=new Map<string,{id:string;url:string}[]>();if(!ids.length)return grouped;
  const canReview=['admin','super_admin','reviewer'].includes(a.role);
  const rows=db.select({resource:caseMedia.caseId,id:media.id}).from(caseMedia).innerJoin(media,eq(caseMedia.mediaId,media.id)).where(and(inArray(caseMedia.caseId,ids),canReview?undefined:eq(media.status,'approved'))).orderBy(caseMedia.sortOrder,caseMedia.mediaId).all();
  for(const row of rows){const list=grouped.get(row.resource)??[];list.push({id:row.id,url:`/api/media/${row.id}/content`});grouped.set(row.resource,list);}return grouped;
}
const fileInfo=(f:typeof files.$inferSelect)=>({id:f.id,name:f.name,purpose:f.purpose,mimeType:f.mimeType,size:f.size,url:`/api/files/${f.id}/download`});
function pageFiles(ids:string[]){
  const grouped=new Map<string,ReturnType<typeof fileInfo>[]>();if(!ids.length)return grouped;
  for(const row of db.select({resource:requirementFiles.requirementId,file:files}).from(requirementFiles).innerJoin(files,eq(requirementFiles.fileId,files.id)).where(inArray(requirementFiles.requirementId,ids)).orderBy(files.createdAt,files.id).all()){
    const list=grouped.get(row.resource)??[];list.push(fileInfo(row.file));grouped.set(row.resource,list);
  }return grouped;
}
function pageHistory(ids:string[]){
  const histories=new Map<string,{reviews:(typeof reviews.$inferSelect)[];submissions:{id:string;actorId:string;createdAt:number}[]}>();
  for(const id of ids)histories.set(id,{reviews:[],submissions:[]});if(!ids.length)return histories;
  for(const review of db.select().from(reviews).where(inArray(reviews.requirementId,ids)).orderBy(desc(reviews.createdAt),sql`rowid DESC`).all())histories.get(review.requirementId)!.reviews.push(review);
  for(const event of db.select({id:auditLogs.id,actorId:auditLogs.actorId,createdAt:auditLogs.createdAt,resourceId:auditLogs.resourceId}).from(auditLogs).where(and(eq(auditLogs.resourceType,'requirement'),eq(auditLogs.action,'resubmit'),inArray(auditLogs.resourceId,ids))).orderBy(desc(auditLogs.createdAt),sql`rowid DESC`).all())histories.get(event.resourceId)!.submissions.push({id:event.id,actorId:event.actorId,createdAt:event.createdAt});
  return histories;
}
function industryOptions(table:typeof cases|typeof requirements,where:SQL|undefined){
  return [...new Set(db.selectDistinct({value:table.industry}).from(table).where(where).all().flatMap(x=>(x.value??'').split(/[、,，/]/).map(v=>v.trim()).filter(Boolean)))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
}
export function registerLists(r:Router,actor:(ctx:any)=>Promise<Actor>,admin:(a:Actor)=>void){
  r.get('/requirements',async ctx=>{
    const a=await actor(ctx),d=reqQuery.parse(ctx.query);if(d.scope==='all')admin(a);
    const access=d.scope==='all'?undefined:eq(requirements.userId,a.id),conditions=commonWhere(requirements,d);
    if(d.category)conditions.push(eq(categoryName,d.category));if(d.consent)conditions.push(eq(requirements.shareConsent,d.consent==='authorized'));
    const where=and(access,...conditions),p=pagination(d);
    ctx.body=db.transaction(tx=>{
      const total=tx.select({total:count()}).from(requirements).where(where).get()!.total;
      const rows=tx.select().from(requirements).where(where).orderBy(...order(requirements,d.sort)).limit(p.pageSize).offset(p.offset).all();
      const ids=rows.map(x=>x.id),linkedTags=pageTags('requirement',ids),linkedFiles=pageFiles(ids),history=pageHistory(ids),images=new Map<string,{id:string;url:string}[]>();
      if(ids.length)for(const link of tx.select().from(requirementMedia).where(inArray(requirementMedia.requirementId,ids)).orderBy(requirementMedia.sortOrder,requirementMedia.mediaId).all()){const list=images.get(link.requirementId)??[];list.push({id:link.mediaId,url:`/api/media/${link.mediaId}/content`});images.set(link.requirementId,list);}
      return pageResponse(rows.map(x=>({...x,...history.get(x.id),images:images.get(x.id)??[],files:linkedFiles.get(x.id)??[],tags:linkedTags.get(x.id)??[]})),total,p);
    });
  });
  r.get('/requirements/facets',async ctx=>{
    const a=await actor(ctx),d=z.object({scope:z.enum(['mine','all']).default('mine')}).strict().parse(ctx.query);if(d.scope==='all')admin(a);
    const access=d.scope==='all'?undefined:eq(requirements.userId,a.id);
    ctx.body={industries:industryOptions(requirements,access),categories:db.select({name:categoryName,total:count()}).from(requirements).where(access).groupBy(categoryName).all(),...db.select({total:count(),missingCategory:sql<number>`coalesce(sum(case when ${requirements.categoryId} is null then 1 else 0 end),0)`,withoutTags:sql<number>`coalesce(sum(case when not exists(select 1 from ${requirementTags} where ${requirementTags.requirementId}=${requirements.id}) then 1 else 0 end),0)`,notAuthorized:sql<number>`coalesce(sum(case when ${requirements.shareConsent}=0 then 1 else 0 end),0)`}).from(requirements).where(access).get()};
  });
  r.get('/cases',async ctx=>{
    const a=await actor(ctx),d=caseQuery.parse(ctx.query);if(d.scope==='all')admin(a);
    const where=and(d.scope==='published'?eq(cases.status,'published'):undefined,...commonWhere(cases,d)),p=pagination(d);
    ctx.body=db.transaction(tx=>{const total=tx.select({total:count()}).from(cases).where(where).get()!.total;const rows=tx.select().from(cases).where(where).orderBy(...order(cases,d.sort)).limit(p.pageSize).offset(p.offset).all();const ids=rows.map(x=>x.id),linked=pageTags('case',ids),linkedImages=pageCaseImages(ids,a);return pageResponse(rows.map(x=>{const images=linkedImages.get(x.id)??[];return {...x,images,coverMediaId:images.some(im=>im.id===x.coverMediaId)?x.coverMediaId:images[0]?.id??null,tags:linked.get(x.id)??[]};}),total,p);});
  });
  r.get('/cases/facets',async ctx=>{const a=await actor(ctx);const d=z.object({scope:z.enum(['published','all']).default('published')}).strict().parse(ctx.query);if(d.scope==='all')admin(a);const access=d.scope==='published'?eq(cases.status,'published'):undefined;ctx.body={industries:industryOptions(cases,access),total:db.select({total:count()}).from(cases).where(access).get()!.total};});
  r.get('/files',async ctx=>{
    const a=await actor(ctx),d=fileQuery.parse(ctx.query);if(d.scope==='all')admin(a);
    const where=and(d.scope==='all'?undefined:eq(files.ownerId,a.id),d.q?sql`instr(lower(${files.name}),lower(${d.q}))>0`:undefined,d.purpose?eq(files.purpose,d.purpose):undefined),p=pagination(d);
    ctx.body=db.transaction(tx=>pageResponse(tx.select().from(files).where(where).orderBy(...order(files,d.sort)).limit(p.pageSize).offset(p.offset).all().map(fileInfo),tx.select({total:count()}).from(files).where(where).get()!.total,p));
  });
  r.get('/media',async ctx=>{const a=await actor(ctx);admin(a);const d=simpleQuery.parse(ctx.query),p=pagination(d);ctx.body=db.transaction(tx=>pageResponse(tx.select({id:media.id,ownerId:media.ownerId,status:media.status,size:media.size,createdAt:media.createdAt}).from(media).orderBy(...order(media,d.sort)).limit(p.pageSize).offset(p.offset).all(),tx.select({total:count()}).from(media).get()!.total,p));});
  r.get('/users/facets',async ctx=>{const a=await actor(ctx);admin(a);z.object({}).strict().parse(ctx.query);ctx.body={activeSupers:db.select({total:count()}).from(users).where(and(eq(users.role,'super_admin'),eq(users.status,'active'))).get()!.total};});
  r.get('/users',async ctx=>{const a=await actor(ctx);admin(a);const d=simpleQuery.parse(ctx.query),p=pagination(d);ctx.body=db.transaction(tx=>pageResponse(tx.select({id:users.id,email:users.email,role:users.role,status:users.status,createdAt:users.createdAt}).from(users).orderBy(...order(users,d.sort)).limit(p.pageSize).offset(p.offset).all(),tx.select({total:count()}).from(users).get()!.total,p));});
}
