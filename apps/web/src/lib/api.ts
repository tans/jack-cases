const statusMessages:Record<number,string>={400:'填写内容有误，请检查后重试。',401:'登录已失效，请重新登录。',403:'你没有执行此操作的权限。',404:'内容不存在或已被移除。',409:'内容状态已变化，请刷新后重试。',413:'文件过大，请缩小文件后重新上传。',429:'操作过于频繁，请稍后重试。'};
const businessMessages:Record<string,string>={
 'Invalid credentials':'邮箱或密码不正确，请检查后重试。','Email already registered':'该邮箱已注册，请直接登录。',
'Requirement already published':'该需求已发布，请刷新查看最新状态。',
 'Category slug already exists':'分类标识已存在，请更换。','Category name already exists':'分类名称已存在，请更换。',
 'File unavailable':'文件暂时不可用，请稍后重试。','Invalid file reference':'资料关联已失效，请重新选择。'
};
export class FeedbackError extends Error {}
export class HttpError extends FeedbackError {
 constructor(public readonly status:number,public readonly path:string,businessError?:unknown){super(status>=500?'服务暂时不可用，请稍后重试。':typeof businessError==='string'&&businessMessages[businessError]||statusMessages[status]||'请求未完成，请稍后重试。');this.name='HttpError';}
}
export function errorMessage(error:unknown):string{return error instanceof FeedbackError?error.message:typeof error==='string'?error:'网络连接失败，请检查网络后重试。';}
export async function api<T=any>(url:string,options:RequestInit={}):Promise<T>{
 const res=await fetch('/api'+url,{credentials:'include',...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
 if(!res.ok){const data=await res.json().catch(()=>null);throw new HttpError(res.status,url,data?.error);}
 try{return await res.json();}catch{throw new HttpError(502,url);}
}
export async function currentUser<T>(signal?:AbortSignal):Promise<T|null>{try{return await api<T>('/me',{signal});}catch(error){if(error instanceof HttpError&&error.status===401)return null;throw error;}}
export async function copyText(text:string){try{await navigator.clipboard.writeText(text);}catch{throw new FeedbackError('复制失败，请允许剪贴板权限，或手动选择文本复制。');}}
export const post=(url:string,body:unknown)=>api(url,{method:'POST',body:JSON.stringify(body)});
export const patch=(url:string,body:unknown)=>api(url,{method:'PATCH',body:JSON.stringify(body)});
