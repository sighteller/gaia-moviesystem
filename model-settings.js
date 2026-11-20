import {refreshSharedModel,readModelFile,saveSharedModel,sharedModelRecord} from './browser-model-store.js?v=20261120shared';
export function mountModelSettings(container,{refresh=refreshSharedModel,readFile=readModelFile,save=saveSharedModel,current=sharedModelRecord}={}){
 container.innerHTML=`<section class="model-settings" aria-labelledby="camera-model-settings-heading"><h3 id="camera-model-settings-heading">Modello di Gaia</h3><p>Il modello salvato qui viene usato dalla webcam e dalle prove video, anche su altri browser e dispositivi.</p><p data-model-current>Controllo il modello attivo…</p><label class="ghost-btn model-file-button">Carica modello di Gaia<input type="file" accept=".json,application/json" data-model-file></label><p data-model-candidate></p><div class="model-settings-actions"><button class="ghost-btn" data-model-save disabled>Salva modello sul sito</button><button class="ghost-btn" data-model-refresh>Aggiorna stato</button><button class="ghost-btn" data-model-download disabled>Scarica modello attivo</button></div><p data-model-status role="status"></p><p class="model-settings-note">Caricare un file lo prepara. Il modello attuale resta in uso finché non premi Salva modello sul sito. I video non vengono caricati.</p><a href="camera-test.html">Prova con un video</a></section>`;
 const $=s=>container.querySelector(s);let candidate=null,fileName='',record=null,busy=false,ready=false,readVersion=0,loadVersion=0;
 const status=text=>$('[data-model-status]').textContent=text;
 function controls(){$('[data-model-save]').disabled=busy||!candidate||!ready;$('[data-model-file]').disabled=busy;$('[data-model-refresh]').disabled=busy;$('[data-model-download]').disabled=!record;}
 function showRecord(value){record=value;const date=value?new Date(value.updated_at).toLocaleString('it-IT'):null;$('[data-model-current]').textContent=value?`Attivo: ${value.file_name} · versione ${value.revision} · aggiornato ${date}`:'Nessun modello ancora salvato sul sito.';controls();}
 async function load(){
  const token=++loadVersion;busy=true;ready=false;controls();
  try{const value=await refresh({force:true,allowCache:false});if(token!==loadVersion)return;showRecord(value.record);ready=true;status(value.record?'Modello disponibile sul sito. Puoi sostituirlo caricando un nuovo file.':'Carica il modello di Gaia e salvalo per renderlo disponibile sul sito.');}
  catch(e){if(token===loadVersion){showRecord(current());status(e.message+' Il modello mostrato potrebbe essere una copia già scaricata.');}}
  finally{if(token===loadVersion){busy=false;controls();}}
 }
 $('[data-model-file]').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;const token=++readVersion;candidate=null;fileName='';controls();
  try{const parsed=await readFile(file);if(token!==readVersion)return;candidate=parsed;fileName=file.name;$('[data-model-candidate]').textContent=`File pronto: ${file.name}. Premi Salva modello sul sito per usarlo.`;status('Il file è compatibile. Il modello attivo non è ancora cambiato.');}
  catch(err){if(token===readVersion){$('[data-model-candidate]').textContent='';status(err.message);}}
  finally{if(token===readVersion)controls();e.target.value='';}
 };
 $('[data-model-save]').onclick=async()=>{
  if(!candidate||busy||!ready)return;busy=true;controls();status('Salvo il modello per il sito…');
  try{const value=await save(candidate,fileName,record?.revision||0);showRecord(value.record);candidate=null;$('[data-model-candidate]').textContent='';status('Modello salvato. La webcam e le prove video useranno questa versione. Se una lettura era in corso, riavviala.');}
  catch(e){status(e.message);if(e.status===409){ready=false;try{const value=await refresh({force:true,allowCache:false});showRecord(value.record);ready=true;status('Il modello era già stato aggiornato da un’altra pagina. Controlla la versione attiva, poi salva di nuovo se vuoi sostituirla.');}catch{ready=false;}}}
  finally{busy=false;controls();}
 };
 $('[data-model-refresh]').onclick=load;
 $('[data-model-download]').onclick=()=>{
  if(!record)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(record.model,null,2)],{type:'application/json'}));a.href=url;a.download='gaia-modello-personalizzato.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 load();return {reload:load};
}
