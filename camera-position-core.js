// Position reference contains only normalized bounds, never images or landmarks.
export function faceBounds(points){
 if(!Array.isArray(points)||points.length<100)return null;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 if([...xs,...ys].some(v=>!Number.isFinite(v)))return null;
 const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 const box={x:(left+right)/2,y:(top+bottom)/2,w:right-left,h:bottom-top};
 return validBounds(box)&&left>.01&&right<.99&&top>.01&&bottom<.99?box:null;
}
export function validBounds(b){return !!b&&['x','y','w','h'].every(k=>Number.isFinite(b[k]))&&b.w>.03&&b.h>.03&&b.w<1&&b.h<1&&b.x-b.w/2>=0&&b.x+b.w/2<=1&&b.y-b.h/2>=0&&b.y+b.h/2<=1;}
export function normalizeReference(value){
 return value?.version===1&&validBounds(value.bounds)&&Number.isFinite(value.aspect)&&value.aspect>.3&&value.aspect<4?{version:1,bounds:{...value.bounds},aspect:value.aspect}:null;
}
export function averagePosition(values){
 if(values.length<15)return null;
 const mean=Object.fromEntries(['x','y','w','h'].map(k=>[k,values.reduce((s,b)=>s+b[k],0)/values.length]));
 return values.every(b=>Math.abs(b.x-mean.x)<.025&&Math.abs(b.y-mean.y)<.025&&Math.abs(b.w/mean.w-1)<.12&&Math.abs(b.h/mean.h-1)<.12)?mean:null;
}
export function positionHint(box,reference,aspect){
 if(!box)return {ready:false,text:'Serve un solo viso interamente visibile.'};
 if(!reference)return {ready:false,text:'Trova una posizione comoda, poi premi Memorizza posizione.'};
 if(Math.abs(aspect/reference.aspect-1)>.08)return {ready:false,text:'Inquadratura cambiata: memorizza di nuovo la posizione.'};
 const target=reference.bounds,scale=Math.sqrt(box.w*box.h/(target.w*target.h));
 if(scale<.82)return {ready:false,text:'Avvicinati un po’ alla webcam.'};
 if(scale>1.22)return {ready:false,text:'Allontanati un po’ dalla webcam.'};
 if(Math.abs(box.x-target.x)>Math.max(.035,target.w*.18))return {ready:false,text:box.x>target.x?'Sposta il viso verso destra sullo schermo.':'Sposta il viso verso sinistra sullo schermo.'};
 if(Math.abs(box.y-target.y)>Math.max(.035,target.h*.18))return {ready:false,text:box.y>target.y?'Porta il viso un po’ più in alto nell’inquadratura.':'Porta il viso un po’ più in basso nell’inquadratura.'};
 return {ready:true,text:'Posizione corretta: mantienila un momento.'};
}
