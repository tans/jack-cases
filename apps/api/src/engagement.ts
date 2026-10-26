import type Koa from 'koa';
import type Router from '@koa/router';
import {and,or,eq,sql,count,exists,isNull,isNotNull} from 'drizzle-orm';
import {z} from 'zod';
import {db} from './db.js';
import {cases,requirements,pageViews,caseFavorites} from './schema.js';
import {previewRateLimit} from './auth-rate-limit.js';

type Actor={id:string;role:string;email:string};
// Query builders keep outer column qualifiers inside correlated subqueries.
export const requirementViewCount=()=>sql<number>`(${db.select({total:count()}).from(pageViews).where(eq(pageViews.requirementId,requirements.id))})`;
export const caseViewCount=()=>sql<number>`(${db.select({total:count()}).from(pageViews).where(or(and(isNotNull(cases.requirementId),eq(pageViews.requirementId,cases.requirementId)),and(isNull(cases.requirementId),eq(pageViews.caseId,cases.id))))})`;
export const isFavorited=(userId:string)=>exists(db.select({id:caseFavorites.caseId}).from(caseFavorites).where(and(eq(caseFavorites.caseId,cases.id),eq(caseFavorites.userId,userId)))).mapWith(Boolean);

export function visitStats(){
  const day=86400,offset=8*3600,today=Math.floor((Date.now()/1000+offset)/day)*day-offset;
  return db.select({total:sql<number>`count(*)`,today:sql<number>`coalesce(sum(${pageViews.createdAt}>=${today}),0)`,last7Days:sql<number>`coalesce(sum(${pageViews.createdAt}>=${today-6*day}),0)`,startedAt:sql<number|null>`min(${pageViews.createdAt})`}).from(pageViews).get()!;
}

export function registerEngagement(r:Router,actor:(ctx:Koa.Context)=>Promise<Actor>,admin:(a:Actor)=>void){
  r.post('/page-views',async ctx=>{
    ctx.set('Cache-Control','no-store');
    previewRateLimit(ctx);
    const d=z.object({id:z.string().uuid(),path:z.string().max(200)}).strict().parse(ctx.request.body);
    let requirementId:string|null=null,caseId:string|null=null;
    const caseMatch=d.path.match(/^\/cases\/([0-9a-f-]{36})$/i),reqMatch=d.path.match(/^\/requirements\/([0-9a-f-]{36})$/i),editMatch=d.path.match(/^\/mine\/([0-9a-f-]{36})\/edit$/i);
    if(caseMatch){
      const c=db.select().from(cases).where(eq(cases.id,caseMatch[1])).get();
      if(!c)return ctx.throw(404,'Not found');
      if(c.status!=='published')admin(await actor(ctx));
      caseId=c.id;requirementId=c.requirementId;
    }else if(reqMatch||editMatch){
      const a=await actor(ctx),v=db.select().from(requirements).where(eq(requirements.id,(reqMatch??editMatch)![1])).get();
      if(!v)return ctx.throw(404,'Not found');
      if(v.userId!==a.id)admin(a);
      // Editing a requirement is a site visit, not a detail view.
      if(reqMatch)requirementId=v.id;
    }else if(/^\/admin(?:\/(?:requirements|comments|cases|media|users|categories|tags|skill))?$/.test(d.path)){
      admin(await actor(ctx));
    }else if(['/submit','/mine','/favorites','/keys'].includes(d.path)){
      await actor(ctx);
    }else if(!['/','/login','/register','/legal/privacy','/legal/terms','/legal/security','/legal/help'].includes(d.path)){
      ctx.throw(400,'Invalid page path');
    }
    db.insert(pageViews).values({id:d.id,path:d.path,requirementId,caseId,createdAt:Math.floor(Date.now()/1000)}).onConflictDoNothing().run();
    ctx.body={ok:true};
  });
  r.put('/cases/:id/favorite',async ctx=>{
    const a=await actor(ctx),c=db.select().from(cases).where(and(eq(cases.id,ctx.params.id),eq(cases.status,'published'))).get();
    if(!c)return ctx.throw(404,'Not found');
    db.insert(caseFavorites).values({userId:a.id,caseId:c.id,createdAt:Math.floor(Date.now()/1000)}).onConflictDoNothing().run();
    ctx.body={favorited:true};
  });
  r.delete('/cases/:id/favorite',async ctx=>{
    const a=await actor(ctx);
    db.delete(caseFavorites).where(and(eq(caseFavorites.userId,a.id),eq(caseFavorites.caseId,ctx.params.id))).run();
    ctx.body={favorited:false};
  });
}
