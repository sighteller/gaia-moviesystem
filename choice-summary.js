export function recordConsultation(summary,titleId){
  if(!titleId||summary.lastTitleId===titleId)return summary;
  return {titleIds:[...new Set([...summary.titleIds,titleId])],steps:summary.steps+1,lastTitleId:titleId};
}
export function choiceMessage(count){
  const n=Math.max(1,Math.trunc(count));
  if(n===1)return 'Ha estratto il film al primo tentativo! Che dirà Merlino?';
  if(n<=5)return `È arrivata Kiki! Porta il film giusto, dopo ${n} tentativi.`;
  if(n<=10)return `Ci vogliono almeno ${n} ingredienti per fare una ratatouille spettacolare come la mia!`;
  if(n<=30)return `La scelta è come una cipolla: ha tanti strati. Tu ne hai sfogliati ${n}.`;
  if(n<=70)return `Nuota e nuota, zitto e nuota… ×${n}. Eccolo finalmente!`;
  return `Hai cercato tra ${n} film. Nemo, al confronto, era dietro l’angolo.`;
}
export function platformUrl(url){
  if(!url)return '';
  try{const parsed=new URL(url);return ['https:','http:','jellyfin:'].includes(parsed.protocol)?parsed.href:'';}catch{return '';}
}
