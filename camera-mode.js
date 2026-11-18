import {faceBounds,normalizeReference,averagePosition,positionHint} from './camera-position-core.js?v=20261117';
import {vectorFromFace,classify,GestureGate,normalizeSamples} from './camera-movement-core.js?v=20261116';
import {CameraStartFlow} from './camera-start-flow.js?v=20261116';
export function initCameraMode({app,isMuted,onStart}){
 const panel=document.createElement('aside');panel.className='camera-panel';panel.hidden=true;panel.setAttribute('aria-label','Webcam e risposte');
 panel.innerHTML='<div class="camera-panel-head"><strong>Modalità webcam</strong><button type="button" data-camera-stop aria-label="Disattiva webcam">×</button></div><div class="camera-preview"><video autoplay muted playsinline aria-label="Anteprima webcam"></video><div class="camera-position-guide" hidden aria-hidden="true"></div></div><section class="camera-position"><strong>Posizionamento</strong><p data-position-status role="status"></p><button type="button" data-position-save disabled>Memorizza posizione</button> <button type="button" data-position-reset hidden>Cancella riferimento</button><p class="camera-position-note">Solo misure salvate in questo browser, senza foto o video. Rifai il riferimento se sposti la webcam. Non occorre tenere la testa dritta.</p></section><div class="camera-reading"><span>Risposta in tempo reale</span><strong data-camera-signal>In attesa</strong></div><p data-camera-question aria-live="polite"></p><p data-camera-status role="status"></p><button type="button" data-camera-repeat>Ripeti domanda</button><details open><summary>Calibrazione dei gesti</summary><p>Mantieni ciascuna posizione per circa un secondo dopo il clic.</p><div class="camera-calibration">'+[['rest','Riposo'],['yes','Sì'],['no','No']].map(([key,label])=>'<button type="button" data-camera-sample="'+key+'">'+label+'</button>').join('')+'</div><p data-camera-counts></p><button type="button" data-camera-save>Salva esempi nel browser</button><button type="button" data-camera-reset>Ricomincia calibrazione</button><p>Riconoscimento sperimentale. I gesti vanno calibrati sulla postura di oggi. Nessuna registrazione o invio del video.</p></details>';
 document.body.append(panel);
 const video=panel.querySelector('video'),signal=panel.querySelector('[data-camera-signal]'),status=panel.querySelector('[data-camera-status]'),question=panel.querySelector('[data-camera-question]'),gate=new GestureGate(),flow=new CameraStartFlow();
 let restoreKeyboardFocus=false;
 let enabled=false,loading=false,version=0,stream=null,detector=null,frame=null,capture=null,samples=normalizeSamples(),lastRun=-Infinity,lastFrame=-1,wasIntro=false;
 const positionStatus=panel.querySelector('[data-position-status]'),positionButton=panel.querySelector('[data-position-save]'),positionReset=panel.querySelector('[data-position-reset]'),guide=panel.querySelector('.camera-position-guide'),preview=panel.querySelector('.camera-preview');
 let reference=null,positionCapture=null,lastBounds=null,readySince=null;
 try{reference=normalizeReference(JSON.parse(localStorage.getItem('gaia_camera_position_v1')||'null'));}catch{}
 const positionText=text=>{if(positionStatus.textContent!==text)positionStatus.textContent=text;};
 function drawReference(){
  guide.hidden=!reference;positionReset.hidden=!reference;
  if(reference){const b=reference.bounds;guide.style.left=((1-b.x-b.w/2)*100)+'%';guide.style.top=((b.y-b.h/2)*100)+'%';guide.style.width=(b.w*100)+'%';guide.style.height=(b.h*100)+'%';}
 }
 function updatePosition(bounds,now){
  lastBounds=bounds;positionButton.disabled=!enabled||!bounds||!!positionCapture;
  const aspect=video.videoWidth/video.videoHeight||4/3;
  preview.style.aspectRatio=String(aspect);
  if(positionCapture){
   gate.reset();guide.classList.remove('ready');readySince=null;
   if(!bounds){positionCapture=null;positionText('Memorizzazione annullata: mantieni un solo viso interamente visibile.');flow.start(now);return false;}
   positionCapture.values.push(bounds);
   const elapsed=now-positionCapture.start;positionText('Mantieni la posizione comoda… '+Math.max(1,Math.ceil((3000-elapsed)/1000)));
   if(elapsed>=3000){
    const mean=averagePosition(positionCapture.values);positionCapture=null;
    if(!mean){positionText('Troppo movimento: riprova mantenendo la posizione per tre secondi.');}
    else{
     const next={version:1,bounds:mean,aspect};
     try{localStorage.setItem('gaia_camera_position_v1',JSON.stringify(next));reference=next;drawReference();positionText('Posizione memorizzata in questo browser.');}
     catch{positionText('Il browser non consente il salvataggio. Riprova consentendo i dati del sito.');}
    }
    flow.start(now);question.textContent='Tra 5 secondi ti chiederò se vuoi cominciare.';
   }
   return false;
  }
  const hint=positionHint(bounds,reference,aspect);
  if(hint.ready)readySince??=now;else readySince=null;
  const ready=readySince!==null&&now-readySince>=1000;
  guide.classList.toggle('ready',ready);positionText(ready?'Posizione pronta ✓':hint.text);
  return true;
 }
 drawReference();positionText(reference?'Riferimento salvato. Attiva la webcam per controllare la posizione.':'Attiva la webcam, poi memorizza la posizione comoda.');
 const labels={yes:'Sì',no:'No',rest:'Riposo',uncertain:'Incerto',uncalibrated:'Da calibrare',missing:'Viso non disponibile'};
 const tell=text=>{if(status.textContent!==text)status.textContent=text;};
 const sync=()=>{app.querySelectorAll('[data-action="camera"]').forEach(b=>{b.classList.toggle('active',enabled||loading);b.setAttribute('aria-pressed',String(enabled||loading));b.setAttribute('aria-label',enabled||loading?'Disattiva webcam':'Attiva webcam');b.title=enabled||loading?'Disattiva webcam':'Attiva webcam';});
  const bar=app.querySelector('.topbar');if(bar)panel.style.top=Math.max(8,bar.getBoundingClientRect().bottom+8)+'px';};
 function counts(){panel.querySelector('[data-camera-counts]').textContent='Riposo: '+samples.rest.length+' · Sì: '+samples.yes.length+' · No: '+samples.no.length;}
 function speak(text){if(isMuted()||!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='it-IT';window.speechSynthesis.speak(utterance);}
 function ask(){question.textContent='Ciao Gaia! Vuoi cominciare?';gate.reset();speak(question.textContent);}
 function returnCameraFocus(){
  const button=app.querySelector('[data-action="camera"]');
  if(button&&restoreKeyboardFocus&&(document.activeElement===document.body||document.activeElement===button||panel.contains(document.activeElement)))button.focus({preventScroll:true});
 }
 function stop(message=''){
  version++;enabled=false;loading=false;flow.stop();capture=null;positionCapture=null;lastBounds=null;readySince=null;positionButton.disabled=true;guide.classList.remove('ready');gate.reset();if(frame!==null)cancelAnimationFrame(frame);frame=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;detector?.close();detector=null;
  if('speechSynthesis' in window)window.speechSynthesis.cancel();panel.hidden=!message;signal.textContent='Webcam spenta';question.textContent='';tell(message);sync();returnCameraFocus();
 }
 async function start(){
  const ticket=++version;loading=true;panel.hidden=false;question.textContent='';tell('Consenti l’accesso alla webcam. Il microfono non viene usato.');sync();
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Webcam non supportata in questo browser.');
   const source=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480}},audio:false});
   if(ticket!==version){source.getTracks().forEach(t=>t.stop());return;}
   stream=source;video.srcObject=source;await video.play();tell('Preparo il riconoscimento dei movimenti…');
   const {FaceLandmarker,FilesetResolver}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
   const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
   if(ticket!==version)return;
   const model=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},runningMode:'VIDEO',numFaces:2,minFaceDetectionConfidence:.65,minFacePresenceConfidence:.65,minTrackingConfidence:.65});
   if(ticket!==version){model.close();return;}detector=model;loading=false;enabled=true;lastFrame=-1;lastRun=-Infinity;gate.reset();
   stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(enabled)stop('La webcam è stata scollegata. Puoi riattivarla.');},{once:true}));
   flow.start(performance.now());question.textContent='Tra 5 secondi ti chiederò se vuoi cominciare.';counts();tell('Calibra riposo, sì e no prima di rispondere.');sync();returnCameraFocus();frame=requestAnimationFrame(tick);
  }catch(error){if(ticket===version)stop(error.name==='NotAllowedError'?'Accesso alla webcam negato. Consenti l’accesso e premi di nuovo la videocamera.':error.name==='NotFoundError'?'Nessuna webcam disponibile.':error.name==='NotReadableError'?'La webcam è occupata da un’altra applicazione.':('Impossibile avviare la webcam: '+error.message));}
 }
 function tick(now){
  if(!enabled)return;frame=requestAnimationFrame(tick);
  if(document.hidden||video.paused||video.readyState<2){gate.reset();return;}
  if(flow.tick(now)==='ask')ask();
  if(now-lastRun<90||video.currentTime===lastFrame)return;lastRun=now;lastFrame=video.currentTime;
  try{
   const faces=detector.detectForVideo(video,now).faceLandmarks;
   const bounds=faces.length===1?faceBounds(faces[0]):null;
   if(!updatePosition(bounds,now))return;
   const vector=faces.length===1?vectorFromFace(faces[0]):null;
   panel.querySelectorAll('[data-camera-sample]').forEach(b=>b.disabled=!vector);
   if(!vector){capture=null;gate.update('missing',now);signal.textContent=faces.length>1?'Più visi visibili':'Viso non disponibile';tell('Serve un solo viso visibile. Nessuna risposta viene accettata.');return;}
   if(capture){
    capture.start??=now;capture.values.push(vector);signal.textContent='Calibrazione…';
    if(now-capture.start<1100)return;
    const mean=[0,1].map(i=>capture.values.reduce((sum,x)=>sum+x[i],0)/capture.values.length),spread=Math.max(...capture.values.map(x=>Math.hypot(x[0]-mean[0],x[1]-mean[1])));
    if(spread>.07)tell('Posizione troppo variabile: ripeti mantenendola più stabile.');
    else if(samples[capture.key].length>=100)tell('Limite di esempi raggiunto. Puoi ricominciare la calibrazione.');
    else{samples[capture.key].push(mean);counts();tell('Esempio aggiunto. Torna al riposo prima di rispondere.');}
    capture=null;gate.reset();return;
   }
   const label=classify(vector,samples,.38);if(signal.textContent!==labels[label])signal.textContent=labels[label]||'Incerto';
   if(!samples.rest.length||!samples.yes.length||!samples.no.length){gate.reset();tell('Aggiungi almeno un esempio di riposo, sì e no.');return;}
   const event=gate.update(label,now,700);
   tell(label==='uncertain'?'Movimento incerto: torna al riposo.':gate.armed?'Pronto a ricevere una risposta.':'Torna al riposo tra due risposte.');
   if(event&&!app.querySelector('[data-overlay],dialog[open]')){
    const action=flow.answer(event);
    if(action==='start'){question.textContent='Cominciamo!';onStart();}
    else if(action==='wait'){question.textContent='Va bene, resto in attesa. Premi Ripeti domanda quando vuoi.';}
   }
  }catch(error){stop('Riconoscimento interrotto: puoi riattivare la webcam.');}
 }
 panel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-position-save')){if(enabled&&lastBounds){capture=null;gate.reset();flow.stop();positionCapture={start:performance.now(),values:[]};question.textContent='Memorizzazione della posizione in corso.';positionButton.disabled=true;}return;}
  if(b.hasAttribute('data-position-reset')){try{localStorage.removeItem('gaia_camera_position_v1');reference=null;positionCapture=null;readySince=null;drawReference();guide.classList.remove('ready');positionText('Riferimento cancellato. Puoi memorizzare una nuova posizione.');}catch{positionText('Non riesco a cancellare il riferimento in questo browser.');}return;}
  if(b.hasAttribute('data-camera-stop'))return stop();
  if(b.hasAttribute('data-camera-repeat')){if(enabled){flow.start(performance.now());gate.reset();question.textContent='Tra 5 secondi ti chiederò se vuoi cominciare.';}return;}
  if(b.dataset.cameraSample){if(!enabled)return;capture={key:b.dataset.cameraSample,start:null,values:[]};gate.reset();tell('Mantieni la posizione: '+labels[capture.key]);return;}
  if(b.hasAttribute('data-camera-reset')){samples=normalizeSamples();capture=null;gate.reset();counts();tell('Calibrazione azzerata. Aggiungi riposo, sì e no.');}
  if(b.hasAttribute('data-camera-save')){try{localStorage.setItem('gaia_movement_examples_v1',JSON.stringify({version:1,samples,date:new Date().toISOString()}));tell('Esempi salvati solo in questo browser. Nessuna immagine salvata.');}catch{tell('Non riesco a salvare gli esempi in questo browser.');}}
 });
 app.addEventListener('click',e=>{if(e.target.closest('[data-action="camera"]')){restoreKeyboardFocus=e.detail===0;if(enabled||loading)stop();else start();}});
 const observer=new MutationObserver(()=>{sync();const intro=!!app.querySelector('.intro-screen');if(enabled&&intro&&!wasIntro){flow.start(performance.now());gate.reset();question.textContent='Tra 5 secondi ti chiederò se vuoi cominciare.';}wasIntro=intro;});observer.observe(app,{childList:true,subtree:true});
 window.addEventListener('resize',sync);
 document.addEventListener('visibilitychange',()=>{capture=null;if(positionCapture&&enabled){flow.start(performance.now());question.textContent='Memorizzazione interrotta. Puoi riprovare.';}positionCapture=null;lastBounds=null;readySince=null;positionButton.disabled=true;guide.classList.remove('ready');gate.reset();if(document.hidden){signal.textContent='In pausa';}});
 window.addEventListener('pagehide',()=>stop());
 try{const saved=JSON.parse(localStorage.getItem('gaia_movement_examples_v1')||'null');if(saved?.version===1)samples=normalizeSamples(saved.samples);}catch{}
 counts();sync();return {stop,isActive:()=>enabled||loading};
}
