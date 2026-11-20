import {BrowserFaceEngine} from './browser-face-engine.js?v=20261120browser';
import {savedModel,refreshSharedModel,modelLabel} from './browser-model-store.js?v=20261120shared';
import {normalizeReference,averagePosition,positionHint} from './camera-position-core.js?v=20261117';
import {CameraChoiceFlow,CHOICE_DURATIONS,YES_SELECTION_MS} from './camera-choice-flow.js?v=20261120tolerance';
export function initCameraMode({app,isMuted,getContext,onOffer,onAsk,onChoose,onAdvance,onCancel,onStop,onManageModel,modelSource={savedModel,refresh:refreshSharedModel}}){
 const panel=document.createElement('aside');panel.className='camera-panel';panel.hidden=true;panel.setAttribute('aria-label','Webcam e risposte');
 panel.innerHTML=`<div class="camera-panel-head"><strong>Modalità webcam</strong><button type="button" data-camera-stop aria-label="Disattiva webcam">×</button></div>
 <div class="camera-preview"><video autoplay muted playsinline aria-label="Anteprima webcam"></video><div class="camera-position-guide" hidden aria-hidden="true"></div></div>
 <div class="camera-reading"><span>Modello di Gaia</span><strong data-camera-signal aria-live="polite">In attesa</strong></div><p data-camera-question aria-live="polite"></p><p data-camera-status role="status"></p>
 <button type="button" data-camera-reference>Rifai riferimento di riposo</button><button type="button" data-camera-repeat>Riprendi scelta</button>
 <p class="camera-position-note">Per scegliere e confermare: almeno 1,5 secondi di Si negli ultimi 2,5. Sono ammesse brevi pause incerte.</p>
 <label class="camera-duration">Tempo per titolo<select data-camera-duration>${CHOICE_DURATIONS.map(seconds=>`<option value="${seconds}"${seconds===5?' selected':''}>${seconds} secondi</option>`).join('')}</select></label>
 <details><summary>Modello e inquadratura</summary><p data-camera-model></p><button type="button" data-camera-manage>Gestisci modello nelle impostazioni</button><p>La webcam usa automaticamente il modello salvato sul sito. I fotogrammi vengono elaborati nel browser.</p>
 <strong>Posizionamento</strong><p data-position-status></p><button type="button" data-position-save disabled>Memorizza inquadratura</button> <button type="button" data-position-reset hidden>Cancella guida</button><p class="camera-position-note">La guida aiuta a ritrovare l’inquadratura. Il riferimento di riposo viene raccolto di nuovo a ogni avvio: non occorre tenere la testa dritta.</p><a href="camera-test.html">Prova il modello con un video</a></details>`;
 document.body.append(panel);
 const $=selector=>panel.querySelector(selector),video=$('video'),signal=$('[data-camera-signal]'),status=$('[data-camera-status]'),question=$('[data-camera-question]'),flow=new CameraChoiceFlow();
 let enabled=false,loading=false,version=0,stream=null,engine=null,animation=null,busy=false,lastRun=-Infinity,lastMedia=-1,origin=null,epoch=0,latest=null,model=modelSource.savedModel(),restoreKeyboardFocus=false;
 let speaking=false,speechVersion=0,speechTimer=null,rendering=false,actionBusy=false,manualPause=false,referenceRequested=false,positionCapture=null,reference=null,lastBounds=null,readySince=null;
 const guide=$('.camera-position-guide'),preview=$('.camera-preview');
 try{reference=normalizeReference(JSON.parse(localStorage.getItem('gaia_camera_position_v1')||'null'));}catch{}
 const text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 const tell=value=>text(status,value);
 function drawReference(){guide.hidden=!reference;$('[data-position-reset]').hidden=!reference;if(reference){const b=reference.bounds;guide.style.left=(1-b.x-b.w/2)*100+'%';guide.style.top=(b.y-b.h/2)*100+'%';guide.style.width=b.w*100+'%';guide.style.height=b.h*100+'%';}}
 function sync(){
  app.querySelectorAll('[data-action="camera"]').forEach(b=>{b.classList.toggle('active',enabled||loading);b.setAttribute('aria-pressed',String(enabled||loading));b.setAttribute('aria-label',enabled||loading?'Disattiva webcam':'Attiva webcam');b.title=enabled||loading?'Disattiva webcam':'Attiva webcam';});
  const bar=app.querySelector('.topbar');if(bar)panel.style.top=Math.max(8,bar.getBoundingClientRect().bottom+8)+'px';
  $('[data-camera-model]').textContent=modelLabel(model);$('[data-position-save]').disabled=!enabled||!lastBounds||!!positionCapture;
  $('[data-camera-reference]').disabled=!enabled;$('[data-camera-repeat]').disabled=!enabled;
 }
 function stopSpeech(){++speechVersion;speaking=false;clearTimeout(speechTimer);speechTimer=null;window.speechSynthesis?.cancel();}
 function speak(value){
  stopSpeech();text(question,value);if(isMuted()||!window.speechSynthesis)return;
  const token=speechVersion,utterance=new SpeechSynthesisUtterance(value);utterance.lang='it-IT';speaking=true;
  const finish=()=>{if(token===speechVersion){speaking=false;clearTimeout(speechTimer);}};utterance.onend=finish;utterance.onerror=finish;
  speechTimer=setTimeout(()=>{if(token===speechVersion){window.speechSynthesis.cancel();finish();}},10000);window.speechSynthesis.speak(utterance);
 }
 function returnFocus(){const button=app.querySelector('[data-action="camera"]');if(button&&restoreKeyboardFocus&&(document.activeElement===document.body||panel.contains(document.activeElement)))button.focus({preventScroll:true});}
 function stop(message=''){
  ++version;enabled=false;loading=false;busy=false;actionBusy=false;rendering=false;manualPause=false;referenceRequested=false;flow.reset();onStop?.();latest=null;positionCapture=null;lastBounds=null;readySince=null;origin=null;
  if(animation!==null)cancelAnimationFrame(animation);animation=null;engine?.close();engine=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;stopSpeech();
  panel.hidden=!message;text(signal,'Webcam spenta');text(question,'');tell(message);guide.classList.remove('ready');sync();returnFocus();
 }
 async function start(){
  panel.hidden=false;panel.scrollTop=0;
  const ticket=++version;loading=true;sync();tell('Recupero il modello salvato sul sito…');
  try{
   const shared=await modelSource.refresh({force:true,allowCache:true});if(ticket!==version)return;model=shared.model;
   if(!model){loading=false;$('details').open=true;tell('Nessun modello disponibile. Apri Gestisci modello nelle impostazioni.');sync();return;}
   const currentEngine=new BrowserFaceEngine();engine=currentEngine;
   tell(shared.cached?'Uso il modello del sito già scaricato su questo dispositivo.':'Preparo il modello nel browser…');
   await currentEngine.start(model);if(ticket!==version){currentEngine.close();return;}
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Webcam non supportata. Usa un browser aggiornato.');
   tell('Consenti l’accesso alla webcam. Il microfono non viene usato.');
   const source=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});
   if(ticket!==version){source.getTracks().forEach(t=>t.stop());return;}
   stream=source;video.srcObject=source;await video.play();if(ticket!==version)return;
   enabled=true;loading=false;origin=null;epoch=0;lastRun=-Infinity;lastMedia=-1;latest=null;manualPause=false;flow.reset();text(question,'Mantieni per tre secondi la postura di riposo comoda di oggi.');tell('Raccolgo il riferimento di riposo.');
   stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(ticket===version)stop('Webcam scollegata. Puoi riattivarla.');},{once:true}));
   sync();returnFocus();animation=requestAnimationFrame(tick);
  }catch(e){if(ticket===version)stop(e.name==='NotAllowedError'?'Accesso alla webcam negato. Consenti la webcam e riprova.':e.name==='NotFoundError'?'Nessuna webcam disponibile.':e.name==='NotReadableError'?'Webcam occupata da un’altra applicazione.':e.message);}
 }
 function updatePosition(bounds,now){
  lastBounds=bounds;preview.style.aspectRatio=String(video.videoWidth/video.videoHeight||4/3);sync();
  if(positionCapture){
   if(!bounds){positionCapture=null;text($('[data-position-status]'),'Viso perso: riprova a memorizzare l’inquadratura.');return;}
   positionCapture.values.push(bounds);
   if(now-positionCapture.start>=3000){const mean=averagePosition(positionCapture.values);positionCapture=null;if(mean){reference={version:1,bounds:mean,aspect:video.videoWidth/video.videoHeight};try{localStorage.setItem('gaia_camera_position_v1',JSON.stringify(reference));}catch{}drawReference();}else text($('[data-position-status]'),'Troppo movimento. Riprova a memorizzare l’inquadratura.');}
  }
  const hint=positionHint(bounds,reference,video.videoWidth/video.videoHeight||4/3);if(hint.ready)readySince??=now;else readySince=null;guide.classList.toggle('ready',readySince!==null&&now-readySince>=1000);text($('[data-position-status]'),reference?hint.text:'Puoi memorizzare questa inquadratura come guida facoltativa.');
 }
 function option(context,index=flow.index){return context?.options?.[index];}
 async function handle(event,context,ticket){
  if(!event)return;const selected=option(context,event.index);if(!selected)return;
  if(event.type==='offer'){onOffer?.(context,selected);if(selected.silent){stopSpeech();text(question,`${selected.label}?`);}else speak(selected.question||`${selected.label}?`);return;}
  if(event.type==='cancel'){onCancel?.(context);stopSpeech();text(question,`Riprendiamo da ${selected.label}.`);return;}
  if(event.type==='ask'){
   rendering=true;
   try{await onAsk?.(context,selected);if(ticket!==version)return;speak('Sei sicura?');}finally{if(ticket===version)rendering=false;}return;
  }
  if(event.type==='choose'||event.type==='advance'){
   actionBusy=true;stopSpeech();
   try{
    const changed=event.type==='choose'?await onChoose(context,selected):await onAdvance(context);
    if(ticket!==version)return;
    if(changed===false){manualPause=true;tell('Non riesco a completare il passaggio. Usa i comandi manuali oppure Riprendi scelta.');}
    else if(event.type==='choose')text(question,`${selected.label}: confermato.`);
   }catch{if(ticket===version){manualPause=true;tell('Passaggio non riuscito. Usa i comandi manuali oppure Riprendi scelta.');}}
   finally{if(ticket===version)actionBusy=false;}
  }
 }
 function tick(now){
  if(!enabled)return;animation=requestAnimationFrame(tick);
  if(document.hidden||video.paused||video.readyState<2){flow.reset();return;}
  if(latest&&now-latest.received>350){text(signal,'Non valutabile');if(flow.phase==='confirm'){onCancel?.(getContext());flow.cancel();}flow.hold(now);}
  if(busy||now-lastRun<124||video.currentTime===lastMedia)return;
  lastRun=now;lastMedia=video.currentTime;busy=true;const ticket=version,atEpoch=epoch;origin??=now;const time=(now-origin)/1000,captureAt=now;
  engine.frame(video,time,atEpoch).then(result=>{
   if(ticket!==version||atEpoch!==epoch||!enabled||document.hidden)return;
   const received=performance.now();if(received-captureAt>350){text(signal,'Non valutabile');flow.update(received,'unavailable',getContext());tell('Il riconoscitore è in ritardo. Chiudi altre schede o applicazioni e riprova.');return;}
   latest={...result,received};updatePosition(result.bounds,received);
   const labels={yes:'Si',rest:'No/Riposo',uncertain:'Incerto',unavailable:'Non valutabile'};text(signal,labels[result.state]);panel.dataset.reading=result.state;
   if(time<3){tell(`Riferimento di riposo: ${Math.max(0,3-time).toFixed(1)} secondi rimasti.`);return;}
   if(!result.reference_ready){tell('Viso non abbastanza visibile nei primi tre secondi. Sistema l’inquadratura e premi Rifai riferimento di riposo.');return;}
   if(result.state==='unavailable')tell(result.reason==='missing_face'?'Viso non rilevabile: il tempo senza lettura non conta come Si.':'Raccolgo il movimento recente prima di interpretare la risposta.');
   else if(!manualPause)tell('Modello attivo nel browser. Senza un sì si avanza per tempo scaduto.');
   if(rendering||actionBusy){flow.hold(received);return;}
   const context=getContext();
   if(!context){flow.reset();if(!manualPause)text(question,'Completa questa schermata con i comandi manuali.');return;}
   const event=flow.update(received,result.state,context,{paused:(speaking&&flow.phase==='confirm')||rendering||actionBusy||manualPause||!!positionCapture,duration:Number($('[data-camera-duration]').value)*1000});
   if(!speaking&&!rendering&&!actionBusy&&!manualPause&&!positionCapture&&['scan','confirm'].includes(flow.phase)){text(question,`${flow.phase==='confirm'?'Sei sicura?':option(context)?.label||'Questa opzione'} · Si rilevato: ${(flow.yesMs/1000).toFixed(1)} / ${(YES_SELECTION_MS/1000).toFixed(1)} s negli ultimi 2,5 s.`);}
   handle(event,context,ticket).catch(()=>{if(ticket===version){manualPause=true;tell('Lettura sospesa. Premi Riprendi scelta.');}});
  }).catch(e=>{if(ticket===version)stop(e.message);}).finally(()=>{if(ticket===version){busy=false;if(referenceRequested){referenceRequested=false;referenceAgain();}}});
 }
 async function referenceAgain(){
  if(!enabled||actionBusy)return;if(busy){referenceRequested=true;tell('Preparo un nuovo riferimento…');return;}tell('Raccolgo un nuovo riferimento di riposo…');++epoch;const ticket=version;flow.reset();stopSpeech();latest=null;origin=null;lastMedia=-1;busy=true;
  try{await engine.reset();if(ticket===version){manualPause=false;text(question,'Mantieni per tre secondi la postura di riposo comoda di oggi.');}}catch(e){if(ticket===version)stop(e.message);}finally{if(ticket===version)busy=false;}
 }
 panel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-camera-stop'))return stop();
  if(b.hasAttribute('data-camera-manage')){stop();onManageModel?.();return;}
  if(b.hasAttribute('data-camera-reference'))return referenceAgain();
  if(b.hasAttribute('data-camera-repeat')){flow.reset();stopSpeech();manualPause=false;return;}
  if(b.hasAttribute('data-position-save')){if(enabled&&lastBounds){positionCapture={start:performance.now(),values:[]};flow.reset();}return;}
  if(b.hasAttribute('data-position-reset')){reference=null;positionCapture=null;try{localStorage.removeItem('gaia_camera_position_v1');}catch{}drawReference();}
 });
 $('[data-camera-duration]').addEventListener('change',()=>{flow.reset();onCancel?.(getContext());});
 app.addEventListener('pointerdown',e=>{if(enabled&&!e.target.closest('[data-action="camera"]')){flow.reset();stopSpeech();manualPause=false;tell('Lettura pronta sulla nuova opzione.');}});
 app.addEventListener('click',e=>{if(e.target.closest('[data-action="camera"]')){restoreKeyboardFocus=e.detail===0;enabled||loading?stop():start();}});
 new MutationObserver(sync).observe(app,{childList:true,subtree:true});window.addEventListener('resize',sync);
 window.addEventListener('gaia-personal-model-changed',e=>{if(enabled||engine)stop('Il modello del sito è stato aggiornato. Riattiva la webcam per usare la nuova versione.');model=e.detail.model;sync();});
 document.addEventListener('visibilitychange',()=>{if(enabled){++epoch;latest=null;flow.reset();positionCapture=null;stopSpeech();text(signal,'In pausa');}});
 window.addEventListener('pagehide',()=>stop());drawReference();sync();return {stop,isActive:()=>enabled||loading,audioChanged(){stopSpeech();if(!enabled||isMuted())return;const context=getContext(),selected=option(context);if(selected)speak(flow.phase==='confirm'?'Sei sicura?':selected.question||`${selected.label}?`);}};
}
