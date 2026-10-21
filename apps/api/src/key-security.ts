import {createHash} from 'node:crypto';

export const keyHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const scopes=['requirements:read','requirements:write','cases:read','taxonomy:read','taxonomy:write','media:read','media:write','content:manage'] as const;
export const agentScopes=['requirements:read','requirements:write','cases:read','taxonomy:read','media:read','media:write'];
export const taxonomyScopes=['taxonomy:read','taxonomy:write'];
export const adminScopes=[...agentScopes,'taxonomy:write','content:manage'];
export function requiredScope(method:string,path:string,query:Record<string,unknown>):string|null{
  if(path==='/api/me')return '';
  if(/^\/api\/(categories|tags)(\/|$)/.test(path))return method==='GET'&&query.scope!=='all'?'taxonomy:read':'taxonomy:write';
  if(path==='/api/admin/skill')return method==='GET'?'content:manage':null;
  if(/^\/api\/requirements(\/|$)/.test(path)){
    if(/\/review$/.test(path))return method==='POST'?'content:manage':null;
    if(query.scope==='all')return method==='GET'?'content:manage':null;
    return method==='GET'?'requirements:read':['POST','PATCH'].includes(method)?'requirements:write':null;
  }
  if(/^\/api\/cases(\/|$)/.test(path))return query.scope!=='all'&&(method==='GET'||method==='POST'&&/\/copy-events$/.test(path))?'cases:read':['GET','POST','PATCH','PUT'].includes(method)?'content:manage':null;
  // Files and legacy images share attachment grants; handlers still enforce ownership/public approval.
  if(/^\/api\/(media|files)(\/|$)/.test(path))return method==='POST'?'media:write':method==='GET'?(path==='/api/media'||query.scope==='all'?'content:manage':'media:read'):null;
  return null; // Users, keys, audit, stats and unknown routes cannot be delegated.
}
