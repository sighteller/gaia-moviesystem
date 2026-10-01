export function recordConsultation(summary,titleId){
  if(!titleId||summary.lastTitleId===titleId)return summary;
  return {titleIds:[...new Set([...summary.titleIds,titleId])],steps:summary.steps+1,lastTitleId:titleId};
}
export function choiceMessage(count){
  const n=Math.max(1,Math.trunc(count));
  if(n===1)return 'Buona la prima: 1 film ed è già quello giusto.';
  if(n<=5)return `Hai fatto il casting a ${n} film. Il ruolo è assegnato!`;
  if(n<=10)return `${n} film ai provini, uno solo sul divano. Buona visione!`;
  if(n<=30)return `Dopo ${n} film, abbiamo il vincitore. Il discorso di ringraziamento può aspettare.`;
  if(n<=70)return `Hai consultato ${n} film: il festival è finito, la serata può cominciare.`;
  return `Il giro del cinema in ${n} film. Ora il viaggio continua dal divano!`;
}
export function platformUrl(url){
  if(!url)return '';
  try{const parsed=new URL(url);return ['https:','http:','jellyfin:'].includes(parsed.protocol)?parsed.href:'';}catch{return '';}
}
