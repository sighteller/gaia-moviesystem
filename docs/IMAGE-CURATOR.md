# Image Curator e Scopri

Sito: https://sighteller.github.io/gaia-moviesystem/
Progetto Supabase: mahjewznwqvdgtdjtekc.

## Comportamento concordato

- Aggiunta pubblica, senza account: nome → risultati con anno, tipo, titolo originale e trama → metadati e cover → categoria e piattaforme → aggiunta.
- Le cover alternative dei titoli già presenti appaiono sotto la cover principale.
- Il clic su una miniatura cambia solo l'anteprima e fa comparire “Salva copertina”.
- Il pulsante non esiste prima di quel clic; dopo il salvataggio scompare.
- Il salvataggio cambia la copertina condivisa del catalogo. Cambiare pagina scarta l'anteprima non salvata.
- Logo piccolo e cliccabile verso la home; “Filtri”; icone statistiche e audio.
- La prima categoria è preselezionata all'ingresso. Hover del mouse, Tab e frecce cambiano evidenziazione; Invio apre quella evidenziata.
- Precedente/successivo sono pulsanti; “Guarda ↵” è sotto le frecce.
- Solo Jellyfin, Netflix, Disney+, Prime Video, RaiPlay. Disponibilità confermata da chi aggiunge; non verificata automaticamente.

## Raccolta iniziale TMDb

Il 1 ottobre 2026 sono state raccolte **274 candidate per tutti i 16 titoli** e salvate
in Supabase. I titoli senza ID sono stati identificati confrontando anno, tipo e
trama; Heidi corrisponde alla serie animata del 1974. Le copertine principali non
sono state cambiate durante la raccolta. Quantità di alternative: 2–24 per titolo.

Si accettano larghezza ≥650 px, altezza ≥1000 px e ratio 0,64–0,75, vicino alla
custodia DVD 129,5/183 ≈0,708. L'intervallo include i poster TMDb 2:3 senza tagliarli
né deformarli. Ordine: italiano, inglese, senza lingua, ratio DVD, risoluzione.
Massimo 24 candidate per titolo; deduplicazione per URL. Le anteprime TMDb sono
w342, il salvataggio usa l'originale. La lettura delle alternative sotto la cover
usa solo immagini già raccolte e non avvia una ricerca TMDb a ogni apertura.

Le alternative di catalogo durano 365 giorni; le candidate di titoli da aggiungere
24 ore. Una ricerca restituisce la raccolta del catalogo già valida, se presente.
Nessun crawler continuo o aggiornamento schedulato è stato introdotto.

## Credenziali e accesso

TMDb è attivo. Il token è conservato cifrato in **Supabase Vault**, con nome
GAIA_TMDB_READ_ACCESS_TOKEN. Non è nel repository, nel JavaScript pubblico o nelle
risposte del servizio. Se si usa invece l'ambiente Edge, il codice accetta anche
TMDB_READ_ACCESS_TOKEN oppure TMDB_API_KEY. Fanart.tv rimane opzionale e non attivo:
per abilitarlo occorre FANART_API_KEY nell'ambiente Edge.

Il frontend non deve conoscere alcun token privato. image-curator è pubblico,
verify_jwt=false per scelta esplicita dell'utente. Usa le credenziali server
Supabase, valida gli input e consente soltanto ricerca, lettura delle candidate,
aggiunta da metadati del provider e scelta di una cover del titolo corretto.
Le scritture dirette anonime su titoli e candidate non sono aperte. Le RPC nuove
sono SECURITY INVOKER e callable solo da service_role. La lettura del token dal
Vault avviene tramite un helper SECURITY DEFINER in gaia_private, schema non
esposto: role check, search_path vuoto e EXECUTE revocato a public/anon/authenticated.
Il wrapper pubblico è SECURITY INVOKER e accessibile solo al server.

Importazione e associazioni piattaforme sono atomiche. L'unicità (tmdb_id,media_type)
impedisce duplicati. Il cambio cover confronta l'URL precedente per rilevare
salvataggi concorrenti. Nessun nome o URL arbitrario ricevuto dal client viene
inserito nel catalogo: si usano le candidate già ottenute dai provider.
Limite per sorgente di 60 operazioni/minuto per istanza Edge; non è un limite
centralizzato fra istanze. Per traffico pubblico elevato aggiungere rate limiting
centralizzato e una revisione antiabuso.

Schema: applicare prima supabase/schema-image-curator.sql e poi
supabase/schema-public-curator.sql (script di evoluzione, non migration CLI).
Il secondo è aggiuntivo: conserva i permessi e il percorso amministrativo precedenti.
Nella UI il login non è più richiesto né presentato.

## Fonti valutate

| Fonte | Impiego | Qualità e limiti |
| --- | --- | --- |
| TMDb | Ricerca, identità, metadati e poster | Dimensioni native dall'API; copertura e qualità variabili. È la fonte della raccolta iniziale |
| Fanart.tv | Poster alternativi | Standard movie poster 1000×1426, ratio 0,701. Per serie serve ID TVDB da TMDb external_ids; non ancora configurato |

Le immagini restano URL dei provider. Per copie permanenti in Storage verificare
le condizioni d'uso. Deduplicazione percettiva e controllo dei pixel effettivi
Fanart sono possibili evoluzioni. Il prodotto presenta logo e disclaimer TMDb.

Documentazione primaria:
- https://developer.themoviedb.org/docs/search-and-query-for-details
- https://developer.themoviedb.org/reference/movie-images
- https://developer.themoviedb.org/docs/image-basics
- https://developer.themoviedb.org/docs/image-languages
- https://developer.themoviedb.org/docs/faq
- https://developer.themoviedb.org/docs/logos-and-attribution
- https://fanart.tv/movie-fanart/
- https://fanart.tv/api-docs/api-v3/
- https://api.fanart.tv/
- https://supabase.com/docs/guides/database/vault

## Scopri senza AI

Usa il catalogo e le ultime 500 scelte di questo dispositivo. “Da riscoprire” include
i rewatch come interesse positivo; “Altre idee” usa soprattutto le categorie scelte.
Entrambi rispettano i filtri piattaforme. Senza storico si propone il catalogo.
Scelta non significa visione confermata: in_progress e presumed_completed sono
segnali di interesse, changed è neutro; No significa “non ora” e non esclude per
sempre. limited/unlimited sono raccolti ma non pesati arbitrariamente.

Evoluzioni: profili e consenso storico, conclusioni di visione esplicite, preferiti,
affinità per generi, diversità e due percorsi “nuove idee” / “rivediamo un preferito”.
Per titoli fuori catalogo servono API TMDb discover/recommendations e verifica delle
piattaforme italiane. AI opzionale: provider LLM e credenziali server, budget,
consenso/retention, segnali aggregati minimi, ID reali validati e disponibilità non
inventate. Nessuna AI è attiva in questa prima struttura.

Il prototipo preesistente permette accesso anonimo a sessioni e storico via device_id;
questo è un identificatore locale, non una credenziale. Per dati privati multiutente
serviranno proprietà autenticate e RLS per utente. L'accesso pubblico per aggiungere
titoli e scegliere cover è invece una scelta esplicita del prodotto.

## Verifica

Node 24: node --test tests/*.test.mjs

I test coprono qualità/ratio, deduplicazione, metadati, disambiguazione, API pubblica,
fallback provider, import, salvataggio esplicito e assenza iniziale del pulsante,
rewatch/cold start. Il collegamento TMDb e la raccolta sono verificati live.
Le RPC di import e cambio cover sono verificate nel database reale in una
transazione con rollback, senza lasciare titoli di prova o cambiare le cover scelte.
