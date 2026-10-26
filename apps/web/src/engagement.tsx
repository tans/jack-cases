import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {Bookmark,Check} from 'lucide-react';
import {api,errorMessage,post} from './lib/api';
import {ErrorLine} from './feedback';

// Route visits, rather than data fetches: refetching and StrictMode do not add views.
export function usePageTracking(enabled:boolean){
  const location=useLocation(),lastVisit=useRef('');
  useEffect(()=>{
    const visit=location.pathname;
    if(!enabled||lastVisit.current===visit)return;
    lastVisit.current=visit;
    void post('/page-views',{id:crypto.randomUUID(),path:location.pathname}).catch(()=>{});
  },[enabled,location.pathname]);
}

export function FavoriteButton({caseId,favorited=false}:{caseId:string;favorited?:boolean}){
  const qc=useQueryClient(),[saved,setSaved]=useState(favorited),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
  useEffect(()=>{setSaved(favorited);setError('');},[caseId,favorited]);
  return <div className="space-y-2"><button type="button" className={'btn btn-sm '+(saved?'btn-soft':'btn-outline')} aria-pressed={saved} disabled={busy} onClick={async()=>{
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{
      const result=await api<{favorited:boolean}>('/cases/'+caseId+'/favorite',{method:saved?'DELETE':'PUT'});
      setSaved(result.favorited);
      await Promise.all([qc.invalidateQueries({queryKey:['cases']}),qc.invalidateQueries({queryKey:['case']})]);
    }catch(e){setError(errorMessage(e));}finally{setBusy(false);lock.current=false;}
  }}>{saved?<Check size={16}/>:<Bookmark size={16}/>}<span>{busy?'保存中…':saved?'已收藏':'收藏需求'}</span></button><ErrorLine error={error}/></div>;
}
