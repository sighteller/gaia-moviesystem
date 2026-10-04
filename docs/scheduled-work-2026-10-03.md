# Lavoro programmato — 3 ottobre 2026

## Pubblicato e verificato
- Impostazioni: rimando a disponibilita.html.
- Carousel homepage: ciclo da 20 a 16 secondi, ritardi proporzionati da 4 a 3,2 secondi.
- Locandine: contenitore con rapporto naturale dell'immagine, object-fit contain conservato; nessuna deformazione o ritaglio.
- Selezione e conferma: blocco centrato, larghezza massima 1000 px. Verifica browser: centro blocco 640 px, centro viewport 640 px; immagine 800×1200, contenitore 276×416 inclusi bordi.
- Supabase: 141 associazioni/link positivi (119 Disney+, 22 Netflix) dalla ricerca del 2 ottobre, senza rimuovere le altre piattaforme e senza trasformare le incertezze in assenze. Le verifiche più recenti esistenti vengono conservate.
- Browser: homepage, Impostazioni, selezione, conferma, modalità e disponibilità Disney+/Jellyfin per Aladdin verificate. Nessuna visione di prova finalizzata.

## Bloccato, non applicato
La migrazione public_catalog_editor_atomic_save è stata respinta dalla revisione automatica: modifica anonima dei titoli e inserimento/aggiornamento pubblico delle associazioni alle piattaforme giudicati troppo ampi, con rischio di alterazioni da terzi. Nessuna parte della migrazione è stata applicata; nessun bypass tentato.

Il catalogo modificabile con archivio/ripristino, citazione scelta, copertina, categoria, anno, salvataggio unico transazionale e avviso di uscita resta da realizzare. Serve una decisione/autorizzazione sul perimetro di modifica pubblica oppure sulla protezione dell'editor. La ricerca delle citazioni resta successiva a questo lavoro come richiesto.

Nessun download, esportazione locale o installazione effettuati. Le modifiche sono state pubblicate tramite i connettori GitHub/Supabase.

## Aggiornamento 4 ottobre: blocco catalogo risolto
Dopo la nuova autorizzazione esplicita dell'utente, sono state approvate e applicate migrazioni più circoscritte e un endpoint separato gaia-catalog. Il catalogo modificabile è pubblicato e verificato, con salvataggio unico transazionale, revisione concorrente, archivio/ripristino e protezione bozze. Il vecchio endpoint gaia-api non è stato ridistribuito dopo il rifiuto automatico; nessun bypass. Il lavoro descritto sopra come da realizzare è ora completato. Vedi work-progress-2026-10-04.md per i controlli e la ricerca citazioni ancora in corso.
