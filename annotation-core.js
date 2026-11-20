export const annotationLabels={yes:'Sì',no:'No',rest:'Riposo / no',none:'Nessuna risposta',uncertain:'Non sono sicuro'};
export function videoKey(file){return JSON.stringify([file.name,file.size,file.lastModified]);}
export function makeAnnotation(label,start,end,duration,note='',id=crypto.randomUUID()){
  if(!Object.hasOwn(annotationLabels,label))throw new Error('Etichetta non valida.');
  if(![start,end,duration].every(Number.isFinite)||start<0||end<start||end>duration)throw new Error('L’intervallo deve essere compreso nel video, con fine dopo inizio.');
  return {id,label,start,end,note:String(note).slice(0,500)};
}
export function readDataset(data){
  if(data?.version!==1||!Array.isArray(data.videos)||data.videos.length>1000)throw new Error('File annotazioni non valido.');
  return data.videos.map(v=>{
    if(typeof v.name!=='string'||!Number.isFinite(v.size)||v.size<0||!Number.isFinite(v.lastModified)||!Number.isFinite(v.duration)||v.duration<0||!Array.isArray(v.annotations)||v.annotations.length>10000)throw new Error('Dati video non validi.');
    const row={name:v.name.slice(0,300),size:v.size,lastModified:v.lastModified,duration:v.duration};
    row.key=videoKey(row);
    row.annotations=v.annotations.map(a=>makeAnnotation(a.label,a.start,a.end,v.duration,a.note,typeof a.id==='string'?a.id:crypto.randomUUID()));
    if(new Set(row.annotations.map(a=>a.id)).size!==row.annotations.length)throw new Error('Identificativi duplicati.');
    return row;
  });
}
