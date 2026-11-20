import {validateModel} from './browser-model-core.js';
const KEYS=['version','model_type','selected_variant','feature_names','feature_indices','mean','scale','coefficients','intercept','yes_threshold','rest_threshold','opening_reference_seconds','history_seconds','history_is_causal','extractor_version'];
export function normalizeModel(value){
 const model=validateModel(value),clean={name:typeof model.name==='string'?model.name.slice(0,100):'Modello personalizzato di Gaia'};
 for(const key of KEYS)clean[key]=model[key];
 return clean;
}
export function canonicalJSON(value){
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export async function modelHash(model){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJSON(model))))).map(b=>b.toString(16).padStart(2,'0')).join('');}
