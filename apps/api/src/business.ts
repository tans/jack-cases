import type Router from '@koa/router';
import {z} from 'zod';
import {and,eq} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {db} from './db.js';
import {businessOptions} from './schema.js';

export const businessFields=['applicableEntities','circulationTypes','businessModes','subdomains'] as const;
const ids=z.array(z.string().min(1).max(100)).max(40).refine(v=>new Set(v).size===v.length,'Duplicate business option');
export const businessInput={applicableEntities:ids.optional(),circulationTypes:ids.optional(),businessModes:ids.optional(),subdomains:ids.optional(),urgency:z.enum(['pending','low','medium','high']).optional(),urgencyReason:z.string().max(3000).nullable().optional(),valueAssessment:z.string().max(6000).nullable().optional()};
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
export function validateBusiness(data:Partial<Record<typeof businessFields[number],string[]>>,previous:Partial<Record<typeof businessFields[number],string[]>>={}){
 for(const field of businessFields){const values=data[field];if(values===undefined)continue;
  for(const id of values){const option=db.select().from(businessOptions).where(eq(businessOptions.id,id)).get();if(!option||option.field!==field||!option.active&&!previous[field]?.includes(id))fail(`Invalid or inactive ${field} option: ${id}`);}
  if(field==='circulationTypes'&&values.length>1&&values.some(id=>['circulation-pending','circulation-na'].includes(id)))fail('流通类型的待确认、不适用不能与其他选项共存');
 }
}
const optionInput=z.object({field:z.enum(businessFields),name:z.string().trim().min(1).max(80),active:z.boolean().default(true),sortOrder:z.number().int().min(0).max(9999).default(0)});
export function registerBusinessOptions(r:Router,actor:(ctx:any)=>Promise<any>,editor:(a:any)=>void,audit:(a:any,action:string,type:string,id:string)=>void){
 r.get('/business-options',async ctx=>{const a=await actor(ctx);const q=z.object({scope:z.enum(['active','history','all']).default('active')}).strict().parse(ctx.query);if(q.scope==='all')editor(a);ctx.body=db.select().from(businessOptions).where(q.scope!=='active'?undefined:eq(businessOptions.active,true)).orderBy(businessOptions.sortOrder,businessOptions.name).all();});
 const unique=(field:string,name:string,exclude?:string)=>{const existing=db.select().from(businessOptions).where(and(eq(businessOptions.field,field),eq(businessOptions.name,name))).get();if(existing&&existing.id!==exclude)fail('Business option already exists',409);};
 r.post('/business-options',async ctx=>{const a=await actor(ctx);editor(a);const d=optionInput.parse(ctx.request.body);unique(d.field,d.name);const item={id:randomUUID(),...d};db.insert(businessOptions).values(item).run();audit(a,'create','business-option',item.id);ctx.status=201;ctx.body=item;});
 r.patch('/business-options/:id',async ctx=>{const a=await actor(ctx);editor(a);const item=db.select().from(businessOptions).where(eq(businessOptions.id,ctx.params.id)).get();if(!item)fail('Not found',404);const d=optionInput.omit({field:true}).partial().strict().parse(ctx.request.body);unique(item.field,d.name??item.name,item.id);db.update(businessOptions).set(d).where(eq(businessOptions.id,item.id)).run();audit(a,'update','business-option',item.id);ctx.body=db.select().from(businessOptions).where(eq(businessOptions.id,item.id)).get();});
}
