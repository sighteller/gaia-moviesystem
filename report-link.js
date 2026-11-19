const link = document.querySelector('[data-report-link]');
const app = document.getElementById('app');
if (link && app) {
  link.addEventListener('click', () => {
    const heading = app.querySelector('.platform-panel h2, .intro-screen h1, .movie-copy h1, .choice-result h2, .mode-grid') ??
      app.querySelector('h1, .empty h2');
    let page = heading?.textContent.trim().replace(/\s+/g, ' ') || 'Gaia';
    if (app.querySelector('.intro-screen')) page = 'Home';
    if (app.querySelector('.category-screen')) page = 'Categorie';
    if (app.querySelector('.movie-stage')) page = 'Scelta del titolo · '+page;
    if (app.querySelector('.mode-grid')) page = 'Modalità della scelta';
    if (app.querySelector('.choice-result')) page = 'Riepilogo della scelta';
    link.hash = new URLSearchParams({pagina:page.slice(0,180)}).toString();
  });
}
