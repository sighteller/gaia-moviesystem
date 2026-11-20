// Audio is independent of webcam recognition. Recorded titles take priority.
export function createSelectionAudio({isMuted,onPlayback=()=>{},allowSpeech=()=>true,speech=window.speechSynthesis,makeAudio=url=>new Audio(url),makeUtterance=text=>new SpeechSynthesisUtterance(text)}){
 let current=null,serial=0;
 function stop(){++serial;const old=current;current=null;if(old)old.pause();speech?.cancel();onPlayback(null);}
 function speak(text){
  stop();if(isMuted()||!allowSpeech()||!speech||!text)return;
  const ticket=serial,utterance=makeUtterance(text);utterance.lang='it-IT';let paused=false;
  const handle={get paused(){return paused;},pause(){paused=true;speech.cancel();}};
  current=handle;onPlayback(handle);
  const finish=()=>{paused=true;if(ticket===serial&&current===handle){current=null;onPlayback(null);}};
  utterance.onend=finish;utterance.onerror=finish;
  try{speech.speak(utterance);}catch{finish();}
 }
 function playTitle(title){
  stop();if(isMuted()||!title)return;
  if(!title.audio_url){speak(title.name);return;}
  const ticket=serial,audio=makeAudio(title.audio_url);current=audio;onPlayback(audio);
  const fallback=()=>{if(ticket!==serial||current!==audio)return;speak(title.name);};
  audio.addEventListener('error',fallback,{once:true});
  try{Promise.resolve(audio.play()).catch(fallback);}catch{fallback();}
 }
 return {stop,speak,playTitle};
}
