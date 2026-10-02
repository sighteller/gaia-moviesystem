export function recordConsultation(summary,titleId){
  if(!titleId||summary.lastTitleId===titleId)return summary;
  return {titleIds:[...new Set([...summary.titleIds,titleId])],steps:summary.steps+1,lastTitleId:titleId};
}
export function choiceMessage(count){
  const n=Math.max(1,Math.trunc(count));
  if(n===1)return 'Buona la prima! Manco quando ti si chiede se vuoi andare da Zia Tamara sei così sicura';
  if(n<=5)return `solo ${n}? Qui mi sa che c'è qualche film sul quale siamo davvero in fissa!`;
  if(n<=10)return `${n} è esattamente il numero di balli che vorrei fare dopo aver visto questo film!`;
  if(n<=30)return `${n} è esattamente il numero di balli che vorrei fare con lo zio beppe`;
  if(n<=70)return `${n} film prima di trovare quello giusto. Poi mi chiedete perchè tengo la testa a sinistra...`;
  return 'Ci abbiamo messo di più a sceglierlo che a vederlo. Sicuri che la Gaia non voleva dirci altro?';
}
export function choiceMessageHtml(count){
  const n=Math.max(1,Math.trunc(count));
  const text=choiceMessage(n);
  if(n===1)return text.replace('prima','<strong>prima</strong>');
  return n<=70?text.replace(String(n),`<strong>${n}</strong>`):text;
}
export function platformUrl(url){
  if(!url)return '';
  try{const parsed=new URL(url);return ['https:','http:','jellyfin:'].includes(parsed.protocol)?parsed.href:'';}catch{return '';}
}
