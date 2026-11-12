const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function sendGmailNotification({url,secret,titleId,title},{fetchFn=fetch,cryptoImpl=crypto,now=Date.now}={}){
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname)||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)throw Error('Configurazione Gmail non valida');
 if(!/^[a-f0-9]{64}$/i.test(secret)||!uuid.test(titleId)||typeof title!=='string'||!title.trim()||title.length>300)throw Error('Notifica non valida');
 const payload=[1,titleId,title,Math.floor(now()/1000)];
 const key=await cryptoImpl.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await cryptoImpl.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(payload)));
 const signature=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const response=await fetchFn(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature}),redirect:'follow',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Invio Gmail da riprovare');
 let result;try{result=await response.json()}catch{throw Error('Risposta Gmail non valida')}
 if(result?.ok!==true)throw Error('Invio Gmail da riprovare');
 return {sent:true,duplicate:result.duplicate===true};
}
