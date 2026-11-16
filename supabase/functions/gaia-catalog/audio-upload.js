export const MAX_AUDIO_BYTES=2*1024*1024;
export function audioFormat(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<32||bytes.length>MAX_AUDIO_BYTES)throw Error('Audio vuoto o troppo grande: massimo 2 MB.');
 const text=(from,to)=>String.fromCharCode(...bytes.slice(from,to));
 if(text(0,4)==='RIFF'&&text(8,12)==='WAVE')return {mime:'audio/wav',ext:'wav'};
 if(text(0,4)==='OggS')return {mime:'audio/ogg',ext:'ogg'};
 if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return {mime:'audio/webm',ext:'webm'};
 if(text(4,8)==='ftyp')return {mime:'audio/mp4',ext:'m4a'};
 if(text(0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224)return {mime:'audio/mpeg',ext:'mp3'};
 throw Error('Formato non riconosciuto: usa MP3, M4A, WebM, Ogg o WAV.');
}
export async function limitedBody(req,max=MAX_AUDIO_BYTES+65536){
 const reader=req.body?.getReader();if(!reader)throw Error('File mancante');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('File troppo grande: massimo 2 MB.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function uploadTitleAudio(req,{baseUrl,service,fetchFn=fetch,uuid=()=>crypto.randomUUID()}){
 if(!service)throw Error('Servizio audio non configurato');
 const bytes=await limitedBody(req);const form=await new Request(req.url,{method:'POST',headers:{'Content-Type':req.headers.get('Content-Type')},body:bytes}).formData();
 const titleId=form.get('titleId'),file=form.get('file');
 if(form.get('action')!=='uploadTitleAudio'||typeof titleId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(titleId)||!file||typeof file.arrayBuffer!=='function')throw Error('Titolo o file audio non valido');
 const data=new Uint8Array(await file.arrayBuffer()),format=audioFormat(data);
 const headers={apikey:service,Authorization:'Bearer '+service};
 const title=await fetchFn(baseUrl+'/rest/v1/titles?id=eq.'+titleId+'&select=id',{headers,signal:AbortSignal.timeout(10000)});
 if(!title.ok||!(await title.json()).length)throw Error('Titolo non trovato');
 const assetId=uuid(),path='title-names/'+titleId+'/'+assetId+'.'+format.ext;
 const uploaded=await fetchFn(baseUrl+'/storage/v1/object/gaia-audio/'+path,{method:'POST',headers:{...headers,'Content-Type':format.mime,'Cache-Control':'max-age=31536000','x-upsert':'false'},body:data,signal:AbortSignal.timeout(30000)});
 if(!uploaded.ok)throw Error('Caricamento audio non riuscito: la bozza è conservata.');
 const publicUrl=baseUrl+'/storage/v1/object/public/gaia-audio/'+path;
 const registered=await fetchFn(baseUrl+'/rest/v1/rpc/gaia_register_title_audio',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({asset_id:assetId,target_title:titleId,asset_path:path,asset_url:publicUrl,asset_mime:format.mime,asset_size:data.length}),signal:AbortSignal.timeout(10000)});
 if(!registered.ok)throw Error('Audio caricato ma non ancora associabile. Riprova: il catalogo non è stato modificato.');
 return {assetId};
}
