import { emptyModel } from './recommendations.js?v=20261006';
export const MODEL_KEY='gaia_recommendations_v1';
export function validateModel(model){
  if(!model||model.version!==1||!['test','live'].includes(model.mode)||!Number.isSafeInteger(model.totalShown)||model.totalShown<0||!Array.isArray(model.exposures)||!Array.isArray(model.choices)||!Array.isArray(model.previousSpecials))throw new Error('Dati dei consigli non validi. Ripristina un backup o azzera dalle impostazioni.');
  if(model.current&&(!Array.isArray(model.current.entries)||!Array.isArray(model.current.scores)||!Array.isArray(model.current.inspirationIds)||!Array.isArray(model.current.underdogIds)))throw new Error('Sessione dei consigli non valida.');
  return model;
}
export function loadModel(storage=localStorage){
  const raw=storage.getItem(MODEL_KEY);
  if(!raw)return emptyModel();
  return validateModel(JSON.parse(raw));
}
export function saveModel(model,storage=localStorage){storage.setItem(MODEL_KEY,JSON.stringify(model));}
