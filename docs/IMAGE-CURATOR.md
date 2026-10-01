# Image Curator e Scopri

## Stato

Gaia è una webapp statica pubblicata su https://sighteller.github.io/gaia-moviesystem/.
Il database remoto è mahjewznwqvdgtdjtekc. La nuova funzione image-curator richiede
JWT Supabase valido e verifica il ruolo admin tramite /auth/v1/user, non user_metadata.
Nessuna credenziale privata viene inviata al browser. La chiave publishable nel frontend
è pubblica per definizione; autorizzazione e scritture dipendono da JWT e RLS.

Flusso: accesso amministratore → ricerca film/serie per nome → risultati con anno,
titolo originale, tipo e trama → metadati e cover → categoria e piattaforme confermate
dall'amministratore → importazione atomica nel catalogo. I duplicati sono impediti da
(tmdb_id, media_type), distinguendo film e serie anche quando gli ID coincidono.
La disponibilità sulle piattaforme è manuale: selezionarle non prova che il titolo
sia attualmente disponibile in Italia. Non inventiamo collegamenti diretti.

## Configurazione necessaria

1. Nel dashboard Supabase, Edge Functions → Secrets, configurare TMDB_READ_ACCESS_TOKEN
   oppure TMDB_API_KEY. La prima viene inviata con Authorization al provider.
2. Configurare FANART_API_KEY per le candidate aggiuntive. È facoltativa: un errore o
   un 404 Fanart non blocca TMDb. Entrambe le API richiedono registrazione presso il provider.
3. Creare un utente email/password tramite Supabase Auth e assegnare
   app_metadata.role = admin da una sorgente amministrativa fidata. Non usare user_metadata.
   Al momento della verifica iniziale il progetto non aveva utenti Auth.
4. Accedere da “Aggiungi titolo”. La sessione amministrativa resta solo in memoria;
   ricaricare la pagina o la scadenza del JWT richiede nuovo accesso.

Non inserire chiavi nelle URL pubbliche, nel repository o in chat.
Lo schema applicato è in supabase/schema-image-curator.sql; è uno script da applicare
una sola volta (le policy non sono idempotenti), non una migration CLI generata.
La funzione RPC è SECURITY INVOKER, non bypassa RLS, e valida cover non scaduta,
creatore, ruolo, categoria e piattaforme. Titolo e associazioni vengono salvati
nella stessa transazione. Le candidate sono conservate per 24 ore; una nuova
richiesta elimina quelle scadute del medesimo amministratore.

## Fonti valutate

| Fonte | Impiego | Qualità e limiti |
| --- | --- | --- |
| TMDb | Ricerca, identificazione, metadati, poster | Dimensioni native restituite dall'API; originali ad alta risoluzione, ma qualità e copertura variano per titolo |
| Fanart.tv | Poster alternativi | Movie poster 1000×1426, ratio 0,701; adatta al DVD. Per serie serve l'ID TVDB ricavato da TMDb external_ids |

Si accettano solo immagini verticali con larghezza ≥650 px, altezza ≥1000 px e
ratio fra 0,64 e 0,75, vicino a 129,5/183 ≈0,708. L'intervallo include i poster TMDb
2:3 senza deformarli o ritagliarli. Ordine: lingua italiana, inglese, senza lingua,
vicinanza alla ratio DVD, risoluzione. Massimo 24 candidate. Deduplicazione per URL
normalizzata dal provider; non è una deduplicazione percettiva tra provider.
Le anteprime TMDb sono w342; il catalogo salva l'originale. Fanart conserva l'asset
originale; le dimensioni sono quelle dello standard del provider. Un futuro worker
può controllare i pixel reali e identificare immagini uguali con hash percettivi.
Se mancano cover adatte, l'importazione è bloccata, senza ingrandire una miniatura.

I dati sono ottenuti al momento della ricerca: non è stato aggiunto un crawler
continuo o un servizio che raccolga tutte le cover del catalogo in background.
Per un futuro aggiornamento del catalogo esistente si possono riutilizzare gli ID
TMDb e la stessa raccolta di candidate, con una coda e un limite richieste.
Le immagini restano URL dei provider; per copie permanenti in Storage occorre
verificare diritti e condizioni del provider. Il prodotto include il disclaimer
TMDb e il logo ufficiale. Prima di uso commerciale verificare la licenza richiesta.

Documentazione primaria consultata:
- https://developer.themoviedb.org/docs/search-and-query-for-details
- https://developer.themoviedb.org/reference/movie-images
- https://developer.themoviedb.org/docs/image-basics
- https://developer.themoviedb.org/docs/image-languages
- https://developer.themoviedb.org/docs/faq
- https://developer.themoviedb.org/docs/logos-and-attribution
- https://fanart.tv/movie-fanart/
- https://fanart.tv/api-docs/api-v3/
- https://api.fanart.tv/
- https://supabase.com/docs/guides/functions/auth-headers

## Scopri: prima struttura senza AI

La pagina usa solo il catalogo e le scelte di questo dispositivo, al massimo le
ultime 500. “Da riscoprire” contiene titoli scelti, con i rewatch come segnale positivo.
“Altre idee” propone titoli del catalogo non presenti tra le scelte positive,
privilegiando le categorie più scelte. Entrambi i gruppi rispettano le piattaforme.
Nessun risultato è presentato come un film nuovo trovato fuori dal catalogo.

Scelta ≠ visione confermata. in_progress e presumed_completed sono segnali di
interesse, non giudizi o completamenti certi. changed è neutro nella prima versione.
No significa “non ora”: nessuna esclusione permanente, nessuna penalità alla
ripetizione. limited/unlimited sono già raccolti, ma non pesati senza una
validazione del loro significato. Le serie non ricevono durate fittizie.
Senza storico si offrono idee dal catalogo, senza inventare personalizzazione.

Evoluzione consigliata:
- Profilo autenticato/familiare, separazione degli utenti e consenso per lo storico.
- Eventi espliciti di visione/conclusione, preferiti, “non ora”, “non mi interessa”.
- Affinità su generi e titoli, diversità e spiegazioni dei suggerimenti.
- Modalità “nuove idee” e “rivediamo un preferito”, senza penalizzare i rewatch.
- Ricerca esterna TMDb discover/recommendations, controlli disponibilità italiani
  e curatela prima dell'aggiunta: servono API e condizioni specifiche.
- AI opzionale lato server: provider LLM, chiave, budget, retention/consenso,
  invio minimo di segnali aggregati, esclusione di identificativi non necessari,
  risposte validate su ID reali. Mai inventare disponibilità o film.

Il prototipo precedente mantiene accesso anonimo allo storico e sessioni tramite
device_id. Questo ID è un identificatore locale, non una credenziale. La nuova
lettura Scopri filtra il dispositivo, ma non risolve l'accesso diretto preesistente.
Prima di un uso multiutente pubblico, migrare sessioni/selezioni a proprietà
autenticate e RLS per utente; il controllo Advisors non sostituisce questa revisione.
L'area catalogo amministrativa introdotta qui è protetta separatamente.

## Verifica

Eseguire con Node 24:
    node --test tests/*.test.mjs

I test verificano ratio/risoluzione, duplicati URL, metadati film/serie, ricerca
chiarificatrice, ruolo admin, fallback Fanart, passaggio cover→RPC, configurazione
mancante, rewatch e cold start. Le API provider sono simulate nei test:
senza account admin e credenziali provider non è possibile dichiarare riuscito
un import live end-to-end. Il catalogo reale non è alterato con titoli di prova.
