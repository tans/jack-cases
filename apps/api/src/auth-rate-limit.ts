import type Koa from 'koa';
import {isIP} from 'node:net';
import {keyHash} from './key-security.js';
const normalize=(ip:string)=>ip.startsWith('::ffff:')?ip.slice(7):ip;
const trusted=new Set((process.env.TRUSTED_PROXY_IPS??'').split(',').map(x=>normalize(x.trim())).filter(Boolean));
for(const ip of trusted)if(!isIP(ip))throw Error('TRUSTED_PROXY_IPS requires comma-separated exact IP addresses');
export async function proxyBoundary(ctx:Koa.Context,next:Koa.Next){
  const peer=normalize(ctx.req.socket.remoteAddress??'unknown');
  let client=peer;
  if(trusted.has(peer)){
    const chain=ctx.get('x-forwarded-for').split(',').map(x=>normalize(x.trim()));
    if(chain.length<=20&&chain.every(ip=>isIP(ip))){
      for(let i=chain.length-1;i>=0&&trusted.has(client);i--)client=chain[i];
    }
  }
  if(!trusted.has(peer)||!['http','https'].includes(ctx.get('x-forwarded-proto')))delete ctx.req.headers['x-forwarded-proto'];
  // Sanitize before Koa reads forwarded properties (including secure-cookie protocol).
  ctx.req.headers['x-forwarded-for']=client;
  delete ctx.req.headers['x-forwarded-host'];
  ctx.state.clientIp=client;
  await next();
}
type Bucket={count:number;reset:number};
const buckets=new Map<string,Bucket>();
const windowMs=15*60*1000;
function ipLimit(name:string,fallback:number){
  const value=process.env[name];if(value===undefined||value==='')return fallback;
  if(!/^[1-9][0-9]*$/.test(value)||Number(value)>100000)throw Error(name+' must be an integer from 1 to 100000');
  return Number(value);
}
// Shared hospital/workshop NATs need headroom; per-account limits remain narrow.
const loginIpLimit=ipLimit('AUTH_LOGIN_IP_LIMIT',200),registerIpLimit=ipLimit('AUTH_REGISTER_IP_LIMIT',50);
export function authRateLimit(ctx:Koa.Context){
  const time=Date.now(),register=ctx.path.endsWith('/register');
  // Count successes too; never reset on a successful credential attempt.
  const rawEmail=(ctx.request.body as {email?:unknown})?.email;
  const email=typeof rawEmail==='string'?rawEmail.trim().toLowerCase():'';
  const rules:[[string,number],[string,number]]=[
    [`${register?'register':'login'}:ip:${ctx.state.clientIp}`,register?registerIpLimit:loginIpLimit],
    [`${register?'register':'login'}:email:${keyHash(email)}`,register?5:10]
  ];
  for(const [key] of rules){const bucket=buckets.get(key);if(bucket&&bucket.reset<=time)buckets.delete(key);}
  // Bound memory without evicting live entries (which would let an attacker reset limits).
  for(const [key,bucket] of buckets)if(bucket.reset<=time)buckets.delete(key);
  if(buckets.size>=10000&&rules.some(([key])=>!buckets.has(key))){ctx.set('Retry-After','900');ctx.throw(429,'请求过于频繁，请在 15 分钟后重试');}
  for(const [key,limit] of rules){const bucket=buckets.get(key);if(bucket&&bucket.count>=limit){ctx.set('Retry-After',String(Math.max(1,Math.ceil((bucket.reset-time)/1000))));ctx.throw(429,'登录或注册尝试过于频繁，请稍后重试');}}
  for(const [key] of rules){const bucket=buckets.get(key)??{count:0,reset:time+windowMs};bucket.count++;buckets.set(key,bucket);}
}
// Anonymous preview endpoints return only titles and images; a short per-IP window caps scraping.
const previewWindowMs=60*1000;
const previewIpLimit=ipLimit('PREVIEW_IP_LIMIT',120);
const previewBuckets=new Map<string,Bucket>();
export function previewRateLimit(ctx:Koa.Context){
  const time=Date.now(),key='preview:ip:'+ctx.state.clientIp;
  const bucket=previewBuckets.get(key);
  if(bucket&&bucket.reset<=time)previewBuckets.delete(key);
  if(previewBuckets.size>=5000&&!previewBuckets.has(key)){ctx.set('Retry-After','60');ctx.throw(429,'请求过于频繁，请稍后重试');}
  if(bucket&&bucket.count>=previewIpLimit){ctx.set('Retry-After',String(Math.max(1,Math.ceil((bucket.reset-time)/1000))));ctx.throw(429,'请求过于频繁，请稍后重试');}
  const next=bucket??{count:0,reset:time+previewWindowMs};
  next.count++;previewBuckets.set(key,next);
}
