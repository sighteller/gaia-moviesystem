import {validateModel} from './browser-model-core.js?v=20261120browser';
const KEY='gaia_personal_model_v1';
export function savedModel(){try{return validateModel(JSON.parse(localStorage.getItem(KEY)||'null'));}catch{return null;}}
export async function importModel(file){
 if(!file||file.size>64000)throw Error('Scegli il piccolo file JSON del modello di Gaia (massimo 64 KB).');
 let model;try{model=validateModel(JSON.parse(await file.text()));}catch(e){if(e instanceof SyntaxError)throw Error('Il file non è un modello JSON leggibile.');throw e;}
 let persisted=true;try{localStorage.setItem(KEY,JSON.stringify(model));}catch{persisted=false;}
 window.dispatchEvent(new CustomEvent('gaia-personal-model-changed',{detail:{model}}));return {model,persisted};
}
export function modelLabel(model){return model?`${model.name||'Modello di Gaia'} · 12 misure di posa e movimento`:'Carica il modello di Gaia una volta per questo browser.';}
