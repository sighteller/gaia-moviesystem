import {annotationLabels,videoKey,makeAnnotation,readDataset} from './annotation-core.js?v=20261116ux';
export function initAnnotations(video){
  const $=id=>document.getElementById(id), storage='gaia_video_annotations_v1';
  const listeners=new Set();
  let rows=[],current=null,loaded=false,deleted=null,editingId=null;
  const status=text=>$('annotation-status').textContent=text;
  try{const saved=localStorage.getItem(storage);if(saved)rows=readDataset(JSON.parse(saved));}catch{status('Non riesco a recuperare il salvataggio locale. Puoi importare una copia esportata.');}
  function persist(){
    try{localStorage.setItem(storage,JSON.stringify({version:1,videos:rows}));status('Annotazioni salvate su questo browser. Esporta una copia per conservarle anche fuori dal browser.');}
    catch{status('Salvataggio locale non riuscito. Esporta le annotazioni prima di chiudere la pagina.');}
  }
  function enabled(){document.querySelectorAll('[data-annotate],#range-start,#range-end,#annotation-add,#step-back,#step-forward,#video-speed').forEach(b=>b.disabled=!loaded);}
  const fieldTime=t=>String(Math.floor(t*1000)/1000);
  function fields(start,end){$('annotation-start').value=fieldTime(start);$('annotation-end').value=fieldTime(end);}
  function render(){
    $('annotation-file').textContent=current?`${current.name} · ${(current.duration||0).toFixed(1)} secondi`:'Apri un video per iniziare.';
    const container=$('annotation-list');container.replaceChildren();
    for(const a of [...(current?.annotations||[])].sort((a,b)=>a.start-b.start)){
      const li=document.createElement('li'), text=document.createElement('span');
      text.textContent=`${a.start.toFixed(2)}–${a.end.toFixed(2)} s · ${annotationLabels[a.label]}${a.note?' · '+a.note:''}`;
      const go=document.createElement('button');go.textContent='Rivedi';go.disabled=!loaded;go.onclick=()=>{video.pause();video.currentTime=a.start;editingId=null;$('annotation-add').textContent='Salva intervallo';status('Video posizionato sulla risposta. Premi Modifica per cambiare questa annotazione.');};
      const remove=document.createElement('button');remove.textContent='Elimina';remove.onclick=()=>{deleted={key:current.key,annotation:a};current.annotations=current.annotations.filter(x=>x.id!==a.id);if(editingId===a.id){editingId=null;$('annotation-add').textContent='Salva intervallo';}persist();render();};
      const edit=document.createElement('button');edit.textContent='Modifica';edit.disabled=!loaded;edit.onclick=()=>{video.pause();video.currentTime=a.start;fields(a.start,a.end);$('annotation-label').value=a.label;$('annotation-note').value=a.note;editingId=a.id;$('annotation-add').textContent='Salva modifica';const panel=$('interval-panel');if(panel)panel.open=true;status('Modifica risposta, tempi o nota, poi premi Salva modifica.');};
      li.append(text,go,remove,edit);container.append(li);
    }
    $('annotation-undo').disabled=!deleted;
    $('annotation-total').textContent=`${rows.length} video annotabili · ${rows.reduce((s,v)=>s+v.annotations.length,0)} annotazioni totali`;
    const count=$('annotation-count');if(count)count.textContent=current?.annotations.length||0;
    const empty=$('annotation-empty');if(empty)empty.hidden=!!current?.annotations.length;
    $('annotation-export').disabled=!rows.some(r=>r.annotations.length);
    renderAssociation();
    enabled();
    listeners.forEach(fn=>fn());
  }
  function renderAssociation(){
    const box=$('annotation-association'),select=$('annotation-source');if(!box||!select)return;
    const options=rows.filter(r=>r!==current&&r.annotations.length);
    box.hidden=!current||!options.length;
    select.replaceChildren();
    for(const row of options){const option=document.createElement('option');option.value=row.key;option.textContent=`${row.name} · ${row.annotations.length} annotazioni · ${row.duration.toFixed(1)} s`;select.append(option);}
    const button=$('annotation-link');if(button)button.disabled=!loaded;
  }
  function add(label,start,end){
    if(!loaded)return status('Apri un video e attendi il caricamento.');
    try{const annotation=makeAnnotation(label,start,end,video.duration,$('annotation-note').value,editingId||crypto.randomUUID());if(editingId){const index=current.annotations.findIndex(a=>a.id===editingId);if(index<0)throw new Error('Annotazione non più disponibile.');current.annotations[index]=annotation;}else current.annotations.push(annotation);editingId=null;$('annotation-add').textContent='Salva intervallo';persist();render();$('annotation-note').value='';}
    catch(e){status(e.message);}
  }
  document.querySelectorAll('[data-annotate]').forEach(b=>b.onclick=()=>{video.pause();editingId=null;add(b.dataset.annotate,video.currentTime,video.currentTime);fields(video.currentTime,video.currentTime);});
  $('range-start').onclick=()=>{$('annotation-start').value=fieldTime(video.currentTime);status('Inizio segnato. Vai alla fine della risposta, segna la fine e scegli l’etichetta.');};
  $('range-end').onclick=()=>{$('annotation-end').value=fieldTime(video.currentTime);video.pause();};
  $('annotation-add').onclick=()=>{if(!$('annotation-start').value||!$('annotation-end').value)return status('Indica inizio e fine dell’intervallo.');add($('annotation-label').value,Number($('annotation-start').value),Number($('annotation-end').value));};
  $('annotation-undo').onclick=()=>{if(!deleted)return;const row=rows.find(r=>r.key===deleted.key);if(row)row.annotations.push(deleted.annotation);deleted=null;persist();render();};
  $('step-back').onclick=()=>{video.pause();video.currentTime=Math.max(0,video.currentTime-.1);};
  $('step-forward').onclick=()=>{video.pause();video.currentTime=Math.min(video.duration,video.currentTime+.1);};
  $('video-speed').onchange=()=>{video.playbackRate=Number($('video-speed').value);};
  video.addEventListener('timeupdate',()=>{$('annotation-time').textContent=`Posizione: ${video.currentTime.toFixed(2)} s`;});
  video.addEventListener('loadedmetadata',()=>{if(!current||video.srcObject)return;loaded=Number.isFinite(video.duration);current.duration=video.duration;video.playbackRate=Number($('video-speed').value);render();});
  video.addEventListener('error',()=>{loaded=false;enabled();});
  $('annotation-export').onclick=()=>{
    if(!rows.some(r=>r.annotations.length))return status('Segna almeno una risposta prima di scaricare le annotazioni.');
    const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),videos:rows.filter(r=>Number.isFinite(r.duration))},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gaia-annotazioni-video.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Copia esportata: contiene etichette, tempi, note e nomi dei file; non contiene i video.');
  };
  $('annotation-import').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>5_000_000)throw new Error('Il file annotazioni è troppo grande (massimo 5 MB).');
      const imported=readDataset(JSON.parse(await file.text()));
      for(const row of imported){const existing=rows.find(r=>r.key===row.key);if(existing){const ids=new Set(existing.annotations.map(a=>a.id));existing.annotations.push(...row.annotations.filter(a=>!ids.has(a.id)));}else rows.push(row);}
      persist();render();
      const importedCount=imported.reduce((s,r)=>s+r.annotations.length,0);
      status(current?.annotations.length?`Annotazioni recuperate. ${current.annotations.length} risposte sul video aperto.`:`${importedCount} annotazioni importate. Apri il video originale oppure collegale al video rinominato qui sotto.`);
      const panel=$('resume-panel');if(panel)panel.open=true;
    }catch(err){status(`Importazione non riuscita: ${err.message}`);}finally{e.target.value='';}
  };
  const link=$('annotation-link');if(link)link.onclick=()=>{
    if(!loaded||!current)return status('Apri prima il video.');
    const source=rows.find(r=>r.key===$('annotation-source').value);if(!source)return;
    if(Math.abs(source.duration-video.duration)>.5)return status('La durata non coincide: queste annotazioni non possono essere collegate a questo video.');
    if(source.annotations.some(a=>a.end>video.duration))return status('Alcune annotazioni sono oltre la fine del video: collegamento annullato.');
    const ids=new Set(current.annotations.map(a=>a.id));current.annotations.push(...source.annotations.filter(a=>!ids.has(a.id)).map(a=>({...a})));persist();render();status(`Collegate ${current.annotations.length} annotazioni al video aperto. Puoi rivederle e scaricarle.`);
  };
  render();
  return {
    current(){return current;},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    setFile(file){loaded=false;deleted=null;editingId=null;$('annotation-add').textContent='Salva intervallo';const key=videoKey(file);current=rows.find(r=>r.key===key);if(!current){current={key,name:file.name,size:file.size,lastModified:file.lastModified,duration:0,annotations:[]};rows.push(current);}fields(0,0);$('annotation-note').value='';render();status(current.annotations.length?`${current.annotations.length} annotazioni ritrovate per questo video.`:'Metti in pausa e indica una risposta. Le annotazioni si conservano su questo browser.');},
    clear(){current=null;loaded=false;deleted=null;editingId=null;render();}
  };
}
