import {curator} from './curator-client.js';

const form = document.getElementById('report-form');
const status = document.getElementById('report-status');
const back = document.getElementById('report-back');
const params = new URLSearchParams(location.hash.slice(1));
form.elements.page.value = (params.get('pagina') || '').slice(0, 180);
if (document.referrer) {
  const previous = new URL(document.referrer);
  const root = new URL('./', location.href).pathname;
  const allowed = ['', 'index.html', 'disponibilita.html', 'citazioni.html'];
  if (previous.origin === location.origin && previous.pathname.startsWith(root) && allowed.includes(previous.pathname.slice(root.length))) {
    back.href = previous.pathname;
    back.textContent = 'Torna alla pagina precedente';
    back.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || history.length < 2) return;
      event.preventDefault();
      history.back();
    });
  }
}

let pending = null;
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const fields = Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,value.trim()]));
  if (!fields.name || !fields.page || fields.description.length < 10) {
    status.textContent = 'Inserisci il tuo nome, la pagina e una descrizione di almeno 10 caratteri.';
    return;
  }
  const fingerprint = JSON.stringify(fields);
  if (pending?.fingerprint !== fingerprint) pending = {fingerprint, id:crypto.randomUUID()};
  button.disabled = true;
  form.setAttribute('aria-busy','true');
  status.textContent = 'Invio in corso…';
  try {
    const result = await curator('reportError', {...fields,id:pending.id});
    status.textContent = result.notification === 'sent'
      ? 'Segnalazione inviata via email. Grazie.'
      : 'Segnalazione salvata. La consegna email non è confermata.';
    form.reset();
    form.elements.page.value = (params.get('pagina') || '').slice(0,180);
    pending = null;
  } catch (error) {
    status.textContent = error.message || 'Invio non riuscito. Riprova.';
  } finally {
    form.removeAttribute('aria-busy');
    button.disabled = false;
  }
});
