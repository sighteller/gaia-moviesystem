import {curator} from './curator-client.js?v=20261001i';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.href:'';}catch{return '';}};
export function openTmdbIdentification({title,onSelect,onManual}){
 const dialog=document.createElement('dialog');dialog.className='tmdb-dialog';
 dialog.innerHTML='<div class="tmdb-dialog-head"><h2>Identifica su TMDb</h2><button type="button" data-close aria-label="Chiudi ricerca TMDb">×</button></div><p>Confronta titolo, anno, tipo e trama. La copertina attuale rimane finché non ne scegli un’altra.</p><form class="tmdb-search-form"><label>Nome da cercare<input name="query" minlength="2" maxlength="120" required value="'+esc(title.name)+'"></label><button type="submit">Cerca</button></form><p class="tmdb-status" role="status"></p><div class="tmdb-results"></div>';
 dialog.insertAdjacentHTML('beforeend','<p class="hint">This product uses the TMDB API but is not endorsed or certified by TMDB. <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">TMDb ↗</a></p>');
 document.body.append(dialog);let alive=true,version=0,results=[],page=1,query=title.name,selected=null,chosenCover=null;
 const status=dialog.querySelector('.tmdb-status'),body=dialog.querySelector('.tmdb-results'),form=dialog.querySelector('form');
 const close=()=>dialog.close();
 dialog.addEventListener('close',()=>{alive=false;version++;dialog.remove();});
 dialog.querySelector('[data-close]').addEventListener('click',close);
 async function search(text,nextPage=1){
  const ticket=++version;status.textContent='Cerco su TMDb…';form.querySelector('button').disabled=true;
  try{
   const data=await curator('search',{query:text,page:nextPage});if(!alive||ticket!==version)return;
   results=data.results;page=data.page;query=text;
   body.innerHTML=results.map((r,i)=>'<button type="button" class="tmdb-result" data-match="'+i+'">'+(image(r.preview_url)?'<img src="'+esc(image(r.preview_url))+'" alt="">':'')+'<span><strong>'+esc(r.name)+'</strong><small>'+esc(r.year||'Anno sconosciuto')+' · '+(r.media_type==='series'?'Serie TV':'Film')+' · '+esc(r.original_title)+'</small><span>'+esc(r.overview||'Trama non disponibile')+'</span></span></button>').join('')+'<div class="tmdb-pages"><button type="button" data-page="-1" '+(page<=1?'disabled':'')+'>Precedenti</button><span>Pagina '+page+'</span><button type="button" data-page="1" '+(page>=data.total_pages?'disabled':'')+'>Altri risultati</button></div>'+(!title.tmdb_id?'<p>Non trovi il contenuto? Puoi correggere titolo e anno nel catalogo e segnarlo come identificato manualmente.</p><button type="button" data-manual>Identificato manualmente</button>':'');
   status.textContent=results.length?'Scegli il risultato corretto.':'Nessun risultato: prova un altro nome o il titolo originale.';
  }catch(e){if(alive&&ticket===version)status.textContent=e.message;}
  finally{if(alive&&ticket===version)form.querySelector('button').disabled=false;}
 }
 form.addEventListener('submit',e=>{e.preventDefault();search(new FormData(form).get('query').trim());});
 dialog.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-page'))return search(query,page+Number(b.dataset.page));
  if(b.hasAttribute('data-manual')){onManual();close();return;}
  if(b.hasAttribute('data-back-results'))return search(query,page);
  if(b.hasAttribute('data-cover-choice')){
   chosenCover=selected.candidates[Number(b.dataset.coverChoice)]?.url||null;
   dialog.querySelectorAll('[data-cover-choice]').forEach(c=>c.classList.toggle('selected',c===b));
   dialog.querySelector('[data-keep-cover]').classList.remove('selected');return;
  }
  if(b.hasAttribute('data-keep-cover')){chosenCover=null;dialog.querySelectorAll('[data-cover-choice]').forEach(c=>c.classList.remove('selected'));b.classList.add('selected');return;}
  if(b.hasAttribute('data-use-match')){if(selected?.identificationId){onSelect({...selected,coverUrl:chosenCover});close();}return;}
  if(!b.hasAttribute('data-match'))return;
  const match=results[Number(b.dataset.match)],ticket=++version;b.disabled=true;status.textContent='Recupero metadati e copertine…';
  try{
   const data=await curator('candidates',{tmdbId:match.tmdb_id,mediaType:match.media_type,identify:true});
   if(!alive||ticket!==version)return;if(!data.identificationId)throw Error('Associazione non pronta: riprova tra poco.');
   selected=data;chosenCover=null;
   body.innerHTML='<h3>'+esc(data.metadata.name)+'</h3><p>'+esc(data.metadata.release_year||'')+' · '+(match.media_type==='series'?'Serie TV':'Film')+'</p><p>'+esc(data.metadata.overview)+'</p><h3>Copertina facoltativa</h3><button type="button" class="selected" data-keep-cover>Mantieni la copertina attuale</button><div class="tmdb-cover-options">'+data.candidates.slice(0,4).map((c,i)=>'<button type="button" data-cover-choice="'+i+'" aria-label="Scegli copertina '+(i+1)+'"><img src="'+esc(image(c.preview_url||c.url))+'" alt=""></button>').join('')+'</div><div class="tmdb-pages"><button type="button" data-back-results>Torna ai risultati</button><button type="button" data-use-match>Usa questo risultato</button></div>';
   status.textContent='L’associazione rimane in bozza fino a Salva modifiche.';
  }catch(error){if(alive&&ticket===version){status.textContent=error.message;b.disabled=false;}}
 });
 dialog.showModal();form.querySelector('input').focus();
 search(title.name);
}
