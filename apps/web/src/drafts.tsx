import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {useBlocker} from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {Button} from './components/ui/button';
import {draftKey,readDraft,writeDraft,type DraftData} from './lib/draft-storage';
export const DraftUser=createContext('');
export function useLocalDraft(recordId:string,value:DraftData,restore:(value:any)=>void,busy=false,enabled=true,autoRestore=false){
 const userId=useContext(DraftUser);const key=draftKey(userId,recordId);const serialized=JSON.stringify(value);
 const state=useRef({key,baseline:serialized,loaded:false,skip:false,done:false});
 const[pending,setPending]=useState<DraftData|null>(null),[message,setMessage]=useState(''),[leaveAction,setLeaveAction]=useState<(()=>void)|null>(null);
 // Read before writing, including StrictMode replay and switching records.
 useEffect(()=>{state.current={key,baseline:serialized,loaded:true,skip:true,done:false};setPending(null);setMessage('');if(!enabled)return;try{const draft=readDraft(localStorage,key);if(draft&&autoRestore)restore(draft);else setPending(draft);}catch{setMessage('无法读取本机草稿，请保留当前页面。');}},[key,enabled]);
 if(state.current.done&&serialized!==state.current.baseline)state.current.done=false;
 const dirty=enabled&&state.current.key===key&&!state.current.done&&serialized!==state.current.baseline;
 useEffect(()=>{if(!enabled||!state.current.loaded||state.current.key!==key)return;if(state.current.skip){state.current.skip=false;return;}if(!dirty||pending)return;try{writeDraft(localStorage,key,value);setMessage('已保存本机草稿（未提交，不改变版本）。');}catch{setMessage('本机草稿保存失败，请勿关闭页面；可重试保存。');}},[key,serialized,dirty,pending,enabled]);
 const blocker=useBlocker(()=>enabled&&!state.current.done&&(busy||(!autoRestore&&serialized!==state.current.baseline)));
 useEffect(()=>{if(!enabled||(!busy&&(!dirty||autoRestore)))return;const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty,busy,enabled,autoRestore]);
 const save=()=>{try{writeDraft(localStorage,key,value);setMessage('已保存本机草稿（未提交，不改变版本）。');return true;}catch{setMessage('本机草稿保存失败，请勿关闭页面；可重试保存。');return false;}};
 const complete=()=>{state.current.done=true;state.current.baseline=serialized;try{localStorage.removeItem(key);setPending(null);setMessage('');}catch{setMessage('提交成功，但本机草稿清理失败。请手动丢弃旧草稿。');}};
 const leave=(action:()=>void)=>{if(dirty||busy)setLeaveAction(()=>action);else action();};
 const cancelLeave=()=>{setLeaveAction(null);if(blocker.state==='blocked')blocker.reset();};
 const confirmLeave=()=>{if(busy)return;if(leaveAction){const action=leaveAction;setLeaveAction(null);action();}else if(blocker.state==='blocked')blocker.proceed();};
 const storageFailed=message.includes('失败')||message.includes('无法读取');
 const controls=autoRestore?null:<><Dialog.Root open={blocker.state==='blocked'||!!leaveAction} onOpenChange={open=>{if(!open)cancelLeave();}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/40"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border bg-white p-5 shadow-lg"><Dialog.Title className="text-lg font-semibold">{busy?'正在上传或提交':'离开尚未提交的表单？'}</Dialog.Title><Dialog.Description className="text-sm leading-relaxed text-slate-600">{busy?'请等待当前操作完成，成功上传的附件会保留在草稿中。':storageFailed?'本机草稿保存失败，离开可能丢失当前修改。请继续编辑并重试保存。':'当前修改尚未提交。离开后可在当前浏览器、当前账号下恢复已保存的本机草稿。'}</Dialog.Description><div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" onClick={cancelLeave}>继续编辑</Button>{!busy&&<Button type="button" onClick={confirmLeave}>{storageFailed?'仍然离开':'保留草稿并离开'}</Button>}</div></Dialog.Content></Dialog.Portal></Dialog.Root><div className="space-y-2 rounded-md border bg-slate-50 p-3 text-sm"><p>本机草稿仅保存在此浏览器，按当前账号和需求隔离。请勿填写密钥或会话信息。</p>{pending&&<div className="flex flex-wrap items-center gap-2"><span>发现此需求的本机草稿。</span><Button type="button" variant="outline" disabled={busy} onClick={()=>{restore(pending);setPending(null);setMessage('已恢复本机草稿，请检查后提交。');}}>恢复草稿</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{try{localStorage.removeItem(key);setPending(null);setMessage('旧草稿已丢弃。');}catch{setMessage('无法清理本机草稿。');}}}>丢弃旧草稿</Button></div>}<Button type="button" variant="outline" disabled={busy||!!pending} onClick={save}>保存本机草稿</Button><p role="status">{message}</p></div></>;
 return {controls,complete,leave,dirty,save,unresolved:!!pending};
}
