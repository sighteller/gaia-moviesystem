// User-provided recordings. Pick one greeting per page access, shared by all prompts.
const base = new URL('./assets/audio/prompts/', import.meta.url);
const greeting = 'hello-' + (1 + Math.floor(Math.random() * 5));
export const promptKeys = ['hello','hello-1','hello-2','hello-3','hello-4','hello-5','start','platform','confirm','repeat','wait','watch','live-action','animation','good-viewing'];
export function promptRecording(text, key) {
 const normalized = String(text || '').toLocaleLowerCase('it').replace(/[!?.,]/g,'').trim();
 if (!key) {
  if (normalized === 'ciao gaia che film vediamo oggi') key = 'hello';
  else if (normalized === 'ciao gaia vuoi cominciare' || normalized === 'vuoi cominciare') key = 'start';
  else if (normalized === 'sei sicura') key = 'confirm';
  else if (normalized === 'dove lo guardiamo') key = 'platform';
  else if (normalized === 'animazione') key = 'animation';
  else if (normalized === 'film') key = 'live-action';
  else if (normalized === 'buona visione') key = 'good-viewing';
  else if (normalized === 'sister non ho capito vuoi ripetere') key = 'repeat';
  else if (normalized === 'va bene aspetto dimmi di sì quando vuoi cominciare') key = 'wait';
  else if (normalized === 'vuoi guardare questo') key = 'watch';
 }
 if (key === 'hello') key = greeting;
 return promptKeys.includes(key) ? new URL(key + '.m4a?v=20261121aacfix', base).href : null;
}
