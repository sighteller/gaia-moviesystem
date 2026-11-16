const MAX=2*1024*1024;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=x=>{try{const u=new URL(x);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
export function initCatalogAudio({list,onChange,onBusy,render,endpoint}){
 const pending=new Map(),messages=new Map();let active=null;
 const message=(id,text)=>{messages.set(id,text);const node=[...list.querySelectorAll('[data-audio-id]')].find(n=>n.dataset.audioId===id)?.querySelector('[data-audio-message]');if(node)node.textContent=text;};
 const release=entry=>{if(entry?.url)URL.revokeObjectURL(entry.url);};
 function setPending(id,blob,name){
  if(blob.size<32||blob.size>MAX)throw Error('File vuoto o troppo grande: massimo 2 MB.');
  if(blob.type&&!/^audio\//i.test(blob.type)&&blob.type!=='video/webm'&&blob.type!=='application/octet-stream')throw Error('Scegli un file audio MP3, M4A, WebM, Ogg o WAV.');
  release(pending.get(id));pending.set(id,{blob,name,url:URL.createObjectURL(blob),assetId:null});
  message(id,'Anteprima pronta. Premi Salva modifiche per confermare.');onChange(id,{pending:true});render();
 }
 function stop(cancel=false){
  const current=active;if(!current)return;
  current.cancelled=cancel;clearTimeout(current.timer);
  current.stream?.getTracks().forEach(t=>t.stop());
  if(current.recorder?.state==='recording')current.recorder.stop();
  else{active=null;onBusy();if(!cancel)message(current.id,'Registrazione annullata prima dell’avvio.');}
 }
 async function record(id){
  if(active)return;const current={id,stream:null,recorder:null,timer:null,cancelled:false};active=current;onBusy();message(id,'Consenti il microfono nel browser…');
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Registrazione non supportata: puoi usare Carica file audio.');
   const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true}});
   if(active!==current||current.cancelled){stream.getTracks().forEach(t=>t.stop());return;}current.stream=stream;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
   const recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:64000}),chunks=[];current.recorder=recorder;
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder.onerror=()=>{current.cancelled=true;stop(true);message(id,'Registrazione non riuscita. Puoi riprovare o caricare un file.');};
   recorder.onstop=()=>{
    clearTimeout(current.timer);stream.getTracks().forEach(t=>t.stop());if(active===current)active=null;onBusy();
    if(!current.cancelled){try{setPending(id,new Blob(chunks,{type:recorder.mimeType||mime||'audio/webm'}),'Registrazione del titolo');}catch(e){message(id,e.message);}}
    render();
   };
   recorder.start();current.timer=setTimeout(()=>stop(),30000);message(id,'Registrazione in corso… massimo 30 secondi.');render();
  }catch(e){current.stream?.getTracks().forEach(t=>t.stop());if(active===current)active=null;onBusy();message(id,e.name==='NotAllowedError'?'Permesso microfono negato. Consenti l’accesso oppure carica un file.':e.message);render();}
 }
 function markup(id,stored){
  const draft=pending.get(id),source=draft?.url||url(stored),recording=active?.id===id;
  return '<fieldset class="catalog-audio" data-audio-id="'+esc(id)+'"><legend>Voce del titolo</legend>'+(source?'<audio controls preload="none" src="'+esc(source)+'" aria-label="Ascolta il titolo"></audio>':'<p>Nessun audio salvato.</p>')+'<div class="audio-actions"><button type="button" data-audio-record '+(active?'disabled':'')+'>Registra voce</button><button type="button" data-audio-stop '+(!recording?'disabled':'')+'>Ferma registrazione</button></div><label>Carica file audio<input type="file" data-audio-file accept="audio/*,.mp3,.m4a,.webm,.ogg,.wav" '+(active?'disabled':'')+'></label>'+(draft?'<p>Da salvare: '+esc(draft.name)+' · '+Math.ceil(draft.blob.size/1024)+' KB</p><button type="button" data-audio-cancel>Annulla modifica audio</button>':'')+'<p data-audio-message role="status">'+esc(messages.get(id)||'Registra, ferma e ascolta. Il file viene caricato solo con Salva modifiche.')+'</p><p class="hint">Massimo 2 MB per file. L’audio confermato sarà riproducibile dal sito pubblico di Gaia.</p></fieldset>';
 }
 list.addEventListener('click',e=>{
  const box=e.target.closest('[data-audio-id]');if(!box)return;const id=box.dataset.audioId;
  if(e.target.closest('[data-audio-record]'))record(id);
  if(e.target.closest('[data-audio-stop]'))stop();
  if(e.target.closest('[data-audio-cancel]')){if(active?.id===id)stop(true);release(pending.get(id));pending.delete(id);messages.delete(id);onChange(id,null);render();}
 });
 list.addEventListener('change',e=>{if(!e.target.hasAttribute('data-audio-file'))return;const id=e.target.closest('[data-audio-id]').dataset.audioId,file=e.target.files[0];if(file)try{setPending(id,file,file.name);}catch(error){message(id,error.message);}e.target.value='';});
 const observer=new MutationObserver(()=>{if(active&&!list.querySelector('[data-audio-id="'+active.id+'"]'))stop();});observer.observe(list,{childList:true,subtree:true});
 window.addEventListener('pagehide',()=>{stop(true);for(const value of pending.values())release(value);});
 return {markup,isRecording:()=>!!active,
  async prepare(changes){
   if(active)throw Error('Ferma la registrazione prima di salvare.');
   const prepared=structuredClone(changes);
   for(const c of prepared){
    if(!c.audio_change)continue;const entry=pending.get(c.id);if(!entry)throw Error('Anteprima audio non disponibile. Seleziona di nuovo il file.');
    if(!entry.assetId){
     message(c.id,'Caricamento audio in corso…');
     const form=new FormData();form.set('action','uploadTitleAudio');form.set('titleId',c.id);form.set('file',entry.blob,'title-audio');
     const response=await fetch(endpoint,{method:'POST',body:form});const result=await response.json();
     if(!response.ok||result.error)throw Error(result.error||'Caricamento audio non riuscito');
     entry.assetId=result.assetId;
    }
    c.audio_change={asset_id:entry.assetId};
   }
   return prepared;
  },
  committed(ids){for(const id of ids){release(pending.get(id));pending.delete(id);messages.delete(id);}}
 };
}
