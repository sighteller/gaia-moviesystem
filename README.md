# Gaia | Movie System

Sito: https://sighteller.github.io/gaia-moviesystem/

Webapp per scegliere film e serie, con categorie Animazione / Film, filtri piattaforme,
navigazione da tastiera e pulsanti, statistiche e storico Supabase.

- Aggiungi titolo senza account, con ricerca chiarificatrice TMDb e scelta cover.
- Alternative sotto la cover principale; anteprima e salvataggio esplicito.
- Raccolte 274 candidate per i 16 titoli iniziali.
- Scopri dal catalogo, con rewatch positivi e senza AI nella prima versione.
- Jellyfin, Netflix, Disney+, Prime Video, RaiPlay.

[Comportamento, fonti, sicurezza e roadmap](docs/IMAGE-CURATOR.md).

Test (Node 24): `node --test tests/*.test.mjs`.
Le credenziali provider sono custodite lato server; non aggiungerle al repository.

Sincronizzazione Jellyfin: [installazione Windows](windows-sync/LEGGIMI.txt) e
[funzionamento e verifiche](docs/JELLYFIN-SYNC.md). Il file di collegamento privato
viene fornito nel pacchetto personale, non nel repository pubblico.
