import {promptRecording} from './prompt-recordings.js?v=20261121aacfix';
// Audio is independent of webcam recognition. Recorded titles take priority.
export function createSelectionAudio({isMuted,onPlayback=()=>{},allowSpeech=()=>true,speech=window.speechSynthesis,makeAudio=url=>{const audio=new Audio(url);audio.hidden=true;audio.dataset.gaiaAudio='';document.body.append(audio);return audio;},makeUtterance=text=>new SpeechSynthesisUtterance(text)}){
 let current=null,serial=0,pending=null;
 function stop(){pending=null;++serial;const old=current;current=null;if(old){old.pause();old.remove?.();}speech?.cancel();onPlayback(null);}
 function speakFallback(text){
  stop();if(isMuted()||!allowSpeech()||!speech||!text)return;
  const ticket=serial,utterance=makeUtterance(text);utterance.lang='it-IT';let paused=false;
  const handle={get paused(){return paused;},pause(){paused=true;speech.cancel();}};
  current=handle;onPlayback(handle);
  const finish=()=>{paused=true;if(ticket===serial&&current===handle){current=null;onPlayback(null);}};
  utterance.onend=finish;utterance.onerror=finish;
  try{speech.speak(utterance);}catch{finish();}
 }
 function playRecording(url, fallback){
  stop();if(isMuted())return;
  const ticket=serial,audio=makeAudio(url);current=audio;onPlayback(audio);
  const finish=()=>{if(ticket===serial&&current===audio){current=null;onPlayback(null);}};
  const failed=error=>{
   if(ticket!==serial||current!==audio)return;
   if(error?.name==='NotAllowedError'){pending={audio,ticket,fallback};onPlayback(null);return;}
   console.warn('Registrazione audio non riproducibile',String(url),error?.name||audio.error?.code,audio.error?.message||'');
   fallback?.();
  };
  audio.addEventListener('ended',finish,{once:true});
  audio.addEventListener('error',()=>failed(),{once:true});
  try{Promise.resolve(audio.play()).catch(failed);}catch(e){failed(e);}
 }
 function speak(text,key){
  const recording=promptRecording(text,key);
  if(recording){playRecording(recording,()=>speakFallback(text));return;}
  speakFallback(text);
 }
 function unlock(){
  if(!pending||isMuted())return;
  const saved=pending;pending=null;
  if(saved.ticket!==serial||current!==saved.audio)return;
  onPlayback(saved.audio);
  try{Promise.resolve(saved.audio.play()).catch(()=>{if(saved.ticket===serial&&current===saved.audio)saved.fallback?.();});}
  catch{if(saved.ticket===serial&&current===saved.audio)saved.fallback?.();}
 }
 function playTitle(title){
  stop();if(isMuted()||!title)return;
  if(!title.audio_url){speak(title.name);return;}
  const ticket=serial,audio=makeAudio(title.audio_url);current=audio;onPlayback(audio);
  const fallback=()=>{if(ticket!==serial||current!==audio)return;speak(title.name);};
  audio.addEventListener('error',fallback,{once:true});
  try{Promise.resolve(audio.play()).catch(fallback);}catch{fallback();}
 }
 return {stop,speak,playTitle,unlock};
}
