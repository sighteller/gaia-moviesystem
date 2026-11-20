import {BrowserFaceEngine} from './browser-face-engine.js?v=20261120browser';
import {savedModel,importModel,modelLabel} from './browser-model-store.js?v=20261120browser';
import {initAnnotations} from './video-annotations.js?v=20261120browser';
import {priorFrame,compareAnnotations} from './personal-results.js?v=20261120browser';
const $=id=>document.getElementById(id),video=$('video'),annotations=initAnnotations(video);
let file=null,url=null,model=savedModel(),engine=null,running=false,busy=false,version=0,epoch=0,lastTime=-1,lastRun=-Infinity,latest=null,frames=[],animation=null,modelHash=null;
const status=value=>$('browser-status').textContent=value;
function controls(){$('browser-model').textContent=modelLabel(model);$('browser-start').disabled=!file||!model||running||video.readyState<2;$('browser-stop').disabled=!running;$('browser-export').disabled=!frames.length;}
function show(label,detail,state='idle',score=null){$('browser-signal').textContent=label;$('browser-detail').textContent=detail;$('browser-readout').dataset.state=state;$('browser-overlay').hidden=!running;$('browser-overlay').textContent=label;$('browser-overlay').dataset.state=state;$('browser-meter').hidden=!Number.isFinite(score);if(Number.isFinite(score))$('browser-meter').value=score;}
function roi(){const s=1/Number($('browser-zoom').value);return s>=.999999?null:[Math.max(0,Math.min(1-s,Number($('browser-x').value)/100-s/2)),Math.max(0,Math.min(1-s,Number($('browser-y').value)/100-s/2)),s];}
function preview(region=roi()){
 const canvas=$('browser-preview');if(video.readyState<2||!region){canvas.hidden=true;return;}canvas.hidden=false;
 const [x,y,s]=region;canvas.width=Math.min(640,video.videoWidth*s);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,x*video.videoWidth,y*video.videoHeight,s*video.videoWidth,s*video.videoHeight,0,0,canvas.width,canvas.height);
}
function refresh(){
 if(!running)return;
 if(video.seeking)return show('Cambio posizione…','Ricostruisco il movimento nel punto scelto.');
 const f=latest,age=f?video.currentTime-f.time:Infinity;
 if(!f||f.epoch!==epoch||age<-.001||age>.22)return show(video.paused?'In pausa':'Attendo il fotogramma…',video.paused?'Premi Riproduci per continuare.':'La risposta precedente non viene mantenuta sui nuovi fotogrammi.');
 const labels={yes:'Possibile sì',rest:'Riposo / non-sì',uncertain:'Incerto',unavailable:'Non valutabile'};
 const reasons={opening:'Raccolgo il riferimento dei primi tre secondi.',missing_reference:'Riferimento insufficiente: riparti con il viso visibile nei primi tre secondi.',missing_face:'Viso non rilevabile. Nessuna risposta interpretata.',history:'Raccolgo il movimento recente.'};
 show(labels[f.state],`${video.paused?'In pausa · ':''}${f.time.toFixed(2)} s · ${reasons[f.reason]||'Indicatore '+f.score_yes.toFixed(2)+' · non è una probabilità'}`,f.state,f.score_yes);preview(f.roi);
}
function stop(message='Lettura fermata. I risultati restano scaricabili finché non cambi video o avvii un’altra prova.'){
 ++version;running=false;busy=false;engine?.close();engine=null;if(animation!==null)cancelAnimationFrame(animation);animation=null;latest=null;controls();show('Lettura non attiva',message);status(message);comparison();
}
function currentFrames(){return [...new Map(frames.map(f=>[f.time.toFixed(4),f])).values()].sort((a,b)=>a.time-b.time);}
function comparison(){const rows=annotations.current()?.annotations||[];if(!rows.length||!frames.length){$('browser-comparison').textContent='Importa o segna le risposte nella casella 2 per confrontarle con questa prova.';return;}const c=compareAnnotations(currentFrames(),rows);$('browser-comparison').textContent=`Nei punti visitati della prova: ${c.yesFound} sì attivati · ${c.yesMissed} sì non attivati · ${c.falseYes} riposi scambiati per sì · ${c.unavailable} non valutabili o non visitati · ${c.uncertainLabels} etichette dubbie escluse. Per gli intervalli si controlla il centro. Non è una misura di tutti gli errori nel filmato.`;}
annotations.subscribe(comparison);
async function start(){
 if(!file||!model||running)return;stop('Preparo il riconoscimento nel browser…');running=true;frames=[];epoch=0;lastTime=-1;lastRun=-Infinity;controls();video.pause();video.currentTime=0;const ticket=version;engine=new BrowserFaceEngine();
 try{
  modelHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(model))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  await engine.start(model);if(ticket!==version)return;await engine.reset(roi());if(ticket!==version)return;status('Lettura attiva nel browser. Puoi mettere in pausa e segnare le risposte vere.');
  animation=requestAnimationFrame(tick);try{await video.play();}catch{status('Modello pronto. Premi Riproduci sul video per iniziare.');}
 }catch(e){if(ticket===version)stop(e.message);}
}
function tick(now){
 if(!running)return;animation=requestAnimationFrame(tick);
 if(busy||document.hidden||video.paused||video.seeking||video.readyState<2||now-lastRun<35||video.currentTime<=lastTime||video.currentTime-lastTime<.124)return;
 lastRun=now;lastTime=video.currentTime;const time=video.currentTime,ticket=version,atEpoch=epoch;busy=true;
 engine.frame(video,time,atEpoch).then(f=>{
  if(ticket!==version||atEpoch!==epoch||document.hidden)return;latest=f;frames.push(f);if(frames.length>100000){stop('Limite della prova raggiunto. Scarica i risultati e avvia una nuova prova.');return;}
  $('browser-counts').textContent=`${frames.length} fotogrammi analizzati in questa prova.`;$('browser-export').disabled=false;refresh();
 }).catch(e=>{if(ticket===version)stop(e.message);}).finally(()=>{if(ticket===version)busy=false;});
}
$('browser-file-input').onchange=e=>{
 const next=e.target.files?.[0];if(!next)return;if(!next.size){status('Il video è vuoto. Scegli il filmato originale.');return;}
 stop();video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);file=next;video.hidden=false;$('browser-empty').hidden=true;url=URL.createObjectURL(file);frames=[];video.src=url;video.load();annotations.setFile(file);$('browser-file').textContent=file.name;$('browser-counts').textContent='';controls();status(model?'Video aperto. Premi Avvia lettura nel browser.':'Video aperto. Carica anche il modello di Gaia.');e.target.value='';
};
$('browser-model-input').onchange=async e=>{const next=e.target.files?.[0];if(!next)return;try{const value=await importModel(next);stop();frames=[];model=value.model;controls();status(value.persisted?'Modello conservato in questo browser. Puoi avviare la lettura.':'Modello pronto per questa pagina; il browser non consente di conservarlo.');}catch(err){status(err.message);}finally{e.target.value='';}};
$('browser-start').onclick=start;$('browser-stop').onclick=()=>stop();
for(const id of ['browser-zoom','browser-x','browser-y'])$(id).addEventListener('input',()=>{if(running)stop('Ritaglio cambiato. Riavvia la lettura per raccogliere il riferimento con il nuovo ritaglio.');preview();});
video.addEventListener('loadedmetadata',controls);video.addEventListener('loadeddata',()=>{controls();preview();});video.addEventListener('timeupdate',refresh);video.addEventListener('pause',()=>{refresh();comparison();});
video.addEventListener('seeking',()=>{if(running){++epoch;latest=null;lastTime=-1;refresh();}});video.addEventListener('seeked',()=>{refresh();if(!running)preview();});
video.addEventListener('ended',()=>{comparison();status('Video terminato. Puoi rivedere i punti, annotare e scaricare i risultati.');});
video.addEventListener('error',()=>{stop('Il browser non riesce a leggere questo video. Prova un MP4 compatibile.');controls();});
$('browser-export').onclick=()=>{
 if(!frames.length)return;const data={version:1,kind:'gaia-browser-model-results',model_sha256:modelHash,hash_basis:'JSON.stringify(model)',model_name:model.name,retrained:false,engine:'MediaPipe Web 0.10.21 IMAGE CPU',framing:roi(),file:{name:file.name,size:file.size,duration:video.duration},frames,comparison:compareAnnotations(currentFrames(),annotations.current()?.annotations||[])};
 const link=document.createElement('a'),objectUrl=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.href=objectUrl;link.download='gaia-risultati-browser.json';link.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
};
document.addEventListener('visibilitychange',()=>{if(running){++epoch;latest=null;lastTime=-1;refresh();}});
window.addEventListener('storage',e=>{if(e.key==='gaia_personal_model_v1'){stop('Modello cambiato in un’altra scheda. Riavvia la lettura.');frames=[];model=savedModel();controls();}});
window.addEventListener('pagehide',()=>{stop();if(url)URL.revokeObjectURL(url);});controls();
