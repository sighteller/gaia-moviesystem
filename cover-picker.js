import { curator,esc,safeImage } from './curator-client.js?v=20261001f';
export function coverSaveRequired(candidate){return candidate!=null;}
export async function mountCoverPicker(container,title){
  let selected=null;
  container.innerHTML='<p class="cover-status" role="status">Caricamento copertine…</p>';
  try{
    const {candidates}=await curator('covers',{titleId:title.id});
    if(!container.isConnected)return;
    if(!candidates.length){container.innerHTML='<p class="cover-status">Nessuna cover alternativa disponibile per questo titolo.</p>';return;}
    const gallery=()=>{container.innerHTML=`<div class="cover-thumbnails" aria-label="Copertine alternative">${candidates.map((c,i)=>`<button class="cover-thumb" data-cover-choice="${esc(c.id)}" aria-label="Copertina alternativa ${i+1}" aria-pressed="false" title="${esc(c.provider)} · ${c.width} × ${c.height}"><img src="${safeImage(c.preview_url)}" alt="" loading="lazy"></button>`).join('')}</div><div class="cover-save-actions"></div><p class="cover-status" role="status"></p>`;};
    const poster=container.closest('.poster-column').querySelector('.poster-wrap');
    const collapse=()=>{container.replaceChildren();poster.querySelector('.cover-change')?.remove();poster.insertAdjacentHTML('beforeend','<button class="ghost-btn cover-change" type="button">Cambia copertina</button>');poster.querySelector('.cover-change').addEventListener('click',()=>{gallery();poster.querySelector('.cover-change').remove();});};
    if(candidates.some(c=>c.url===title.dvd_cover_url))collapse();else gallery();
    container.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b||b.disabled)return;
      const status=container.querySelector('.cover-status');
      if(b.dataset.coverChoice){
        selected=candidates.find(c=>c.id===b.dataset.coverChoice);if(!selected)return;
        const img=container.closest('.poster-column').querySelector('.poster-wrap img');
        if(img)img.src=selected.url;
        container.querySelectorAll('[data-cover-choice]').forEach(x=>{const active=x.dataset.coverChoice===selected.id;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});
        container.querySelector('.cover-save-actions').innerHTML=coverSaveRequired(selected)?'<button class="primary" data-save-cover>Salva copertina</button>':'';
        status.textContent='Anteprima: premi Salva copertina per confermare.';return;
      }
      if(b.hasAttribute('data-save-cover')&&selected){
        b.disabled=true;container.querySelectorAll('[data-cover-choice]').forEach(x=>x.disabled=true);status.textContent='Salvataggio…';const choice=selected;
        try{
          const result=await curator('saveCover',{titleId:title.id,candidateId:choice.id,expectedUrl:title.dvd_cover_url??null});
          title.dvd_cover_url=result.url;
          if(!container.isConnected)return;
          selected=null;container.querySelector('.cover-save-actions').replaceChildren();collapse();
        }catch(err){if(container.isConnected){status.textContent=err.message;b.disabled=false;container.querySelectorAll('[data-cover-choice]').forEach(x=>x.disabled=false);}}
      }
    });
  }catch(err){if(container.isConnected)container.innerHTML=`<p class="cover-status" role="status">${esc(err.message)}</p>`;}
}
