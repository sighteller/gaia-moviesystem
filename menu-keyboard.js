// Keyboard navigation between the current screen and the top menu.
export function initMenuKeyboard({app,state,syncFilters}){
 let lastAction='catalog-search',returnScreen=null,returnSession=null,menuScreen=false;
 const editable=e=>!!e.target.closest('input,textarea,select,[contenteditable="true"]');
 const visible=el=>!el.disabled&&!el.closest('[hidden]')&&el.getClientRects().length>0;
 const buttons=()=>[...app.querySelectorAll('.topbar .small-actions button')].filter(visible);
 function clearHighlight(){app.querySelectorAll('.keyboard-selected').forEach(b=>b.classList.remove('keyboard-selected'));}
 function focus(el){if(!el)return;clearHighlight();el.classList.add('keyboard-selected');el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'});}
 function menu(){const bs=buttons();focus(bs.find(b=>b.dataset.action===lastAction)||bs[0]);}
 function content(){
  clearHighlight();
  const target=app.querySelector('.movie-stage,.category-card.preselected,.mode-card.preselected,.intro-start,.catalog-search input,.statistics-screen button,.curator input,.curator button');
  target?.focus({preventScroll:true});
 }
 function restore(){
  if(returnScreen){
   app.replaceChildren(...returnScreen);state.session=returnSession;returnScreen=null;returnSession=null;menuScreen=false;
   syncFilters();menu();
  }else menu();
 }
 function reset(){returnScreen=null;returnSession=null;menuScreen=false;clearHighlight();}
 app.addEventListener('click',e=>{
  const b=e.target.closest('.topbar .small-actions button');if(!b)return;
  lastAction=b.dataset.action;
  if(['catalog-search','discover','add-title','stats'].includes(lastAction)){
   if(!menuScreen){returnScreen=[...app.childNodes];returnSession=state.session;}
   menuScreen=true;
  }
 },true);
 app.addEventListener('focusin',e=>{
  if(e.target.matches('.topbar .small-actions button')){lastAction=e.target.dataset.action;clearHighlight();e.target.classList.add('keyboard-selected');}
 });
 app.addEventListener('pointerdown',clearHighlight);
 document.addEventListener('keydown',e=>{
  if(e.isComposing||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('.camera-panel'))return;
  const overlay=app.querySelector('[data-overlay]'),top=e.target.closest('.topbar .small-actions button');
  const isBack=e.key==='Backspace'||e.key==='Escape';
  // Editing keeps normal caret and deletion behavior. Escape is always available.
  if(editable(e)&&e.key!=='Escape'&&!(e.key==='ArrowUp'&&e.target.matches('#catalog-query')&&!e.target.value))return;
  const consume=()=>{e.preventDefault();e.stopImmediatePropagation();};
  if(isBack){
   if(overlay){
    const close=overlay.querySelector('[data-action="close-filters"],[data-action="close-settings"],[data-action^="close-"]');
    if(close){consume();close.click();menu();}return;
   }
   if(top){consume();if(menuScreen)restore();else content();return;}
   if(menuScreen){consume();restore();return;}
   // Leave the existing confirmation back action intact.
   if(app.querySelector('.movie-stage[data-confirming]'))return;
   if(e.key==='Backspace'){consume();}return;
  }
  if(overlay){
   if(['ArrowUp','ArrowDown'].includes(e.key)){
    const controls=[...overlay.querySelectorAll('button,a[href],input,select,textarea')].filter(visible);
    if(!controls.length)return;
    consume();const i=controls.indexOf(document.activeElement);
    focus(controls[(i<0?(e.key==='ArrowDown'?0:controls.length-1):(i+(e.key==='ArrowDown'?1:-1)+controls.length)%controls.length)]);
   }else if(e.key==='Enter'&&!editable(e)&&!e.repeat){const control=e.target.closest('button,a[href]');if(control){consume();control.click();}}
   return;
  }
  if(top){
   if(['ArrowUp','ArrowDown'].includes(e.key)){consume();const bs=buttons(),i=bs.indexOf(top);focus(bs[(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length]);return;}
   if(e.key==='Enter'){consume();if(!e.repeat){top.click();const panel=app.querySelector('[data-overlay]');if(panel)focus([...panel.querySelectorAll('button,a[href],input,select')].find(visible));else if(['mute','camera'].includes(lastAction))menu();}return;}
   // Horizontal arrows must never change a film while the menu has focus.
   if(['ArrowLeft','ArrowRight'].includes(e.key)){consume();return;}
  }
  if(e.key==='ArrowUp'&&!e.target.closest('.cover-options,.curator:not(.catalog-search) form')&&!app.querySelector('dialog[open]')){consume();menu();return;}
  if(e.key==='ArrowDown'&&menuScreen&&!e.target.closest('.catalog-search')){
   const controls=[...app.querySelectorAll('.statistics-screen button,.statistics-screen summary,.curator button,.curator a[href]')].filter(visible);
   if(controls.length){consume();const i=controls.indexOf(document.activeElement);focus(controls[(i+1)%controls.length]);}
  }
 },true);
 return {reset};
}
