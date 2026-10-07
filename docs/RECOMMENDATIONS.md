# Consigli centrali per Gaia

Il motore viene eseguito nel backend gaia-api; il browser conserva solo ID del dispositivo, filtri e la sequenza della sessione in memoria. Non legge né importa il vecchio modello localStorage o le statistiche delle prove preesistenti.

## Dati

Supabase, schema privato gaia_private:
- recommendation_profiles: soggetto e periodo di apprendimento attivo.
- recommendation_epochs: modello, revisione atomica e modalità test/live.
- recommendation_sessions: graduatoria e proposte congelate della singola sessione, vincolate al dispositivo.
- recommendation_exposures: una scheda realmente mostrata per titolo/sessione, tipo, costo, esito e numero progressivo globale.
- recommendation_choices: scelte al click verso la piattaforma; lo stesso film prima della fine prevista non crea una nuova scelta.
- imported_playback_events e playback_history_imports: cronologie Netflix/Jellyfin; future cronologie Disney possono usare la stessa struttura.

I dati originali importati restano privati e separati. Solo i titoli del catalogo approvato, disponibili sulle piattaforme selezionate, sono candidati. L'associazione delle cronologie mancanti viene ricalcolata automaticamente per nome italiano/originale normalizzato quando un titolo entra in catalogo; associazioni ambigue non vengono inventate. Il matching viene effettuato nel server, senza pubblicare dati grezzi. Durate zero, extra e anomalie contrassegnate non alimentano le preferenze. Le cronologie senza fuso dichiarato forniscono recenza a livello di giorno, con calendario Europe/Rome; non vengono inventati istanti di visione UTC.

## Regole iniziali

- Recenza: massimo 40, dimezzamento ogni 4 giorni.
- Ripetizioni: massimo 30, rendimenti decrescenti, memoria recente con dimezzamento ogni 7 giorni.
- Preferenza storica: massimo 20, crescita logaritmica; base iniziale massimo 10.
- Scheda recente non scelta: −8; altra scheda: −2. “No” esplicito aggiunge −4 oppure −1. Penalità dimezzate ogni 14 giorni, applicate all'ordine della sessione successiva.
- Una scelta rinnova l'interesse e cancella la penalità di esposizione per quel titolo nella sessione.
- Ogni 4 schede nuove effettivamente mostrate: Scopri, nella metà inferiore della graduatoria.
- Ogni 20: Ricordo, nell'ultimo quinto, al posto di Scopri; SVG Rewind fornito dall'utente, badge lilla sotto l'anno. La precedente clessidra è sostituita dal riferimento grafico più recente.
- Rotazione ponderata per esposizioni/peso: titoli meno proposti prima; titoli con punti più bassi ritornano meno spesso, senza sparire dalla rotazione.
- Uno spunto non scelto non ricompare nella sessione successiva. Se viene scelto può essere promosso. Le sessioni avviate ma mai mostrate non interrompono l'esclusione.
- Avanti/indietro conserva l'ordine; rivedere la stessa scheda non incrementa il contatore. Cataloghi insufficienti usano proposte normali, senza forzare ripetizioni di spunti.

Il contatore è condiviso fra dispositivi del soggetto Gaia. Revisioni e commit sotto lock impediscono di perdere o duplicare eventi quando le richieste si sovrappongono. Il server accetta solo titoli proposti e mostrati nella sessione del dispositivo; non riceve punteggi dal browser.

## Prove e passaggio all'uso reale

La modalità pubblicata inizialmente è test. Nessun vecchio dato è cancellato. Quando l'utente avvisa dell'inizio dell'uso di Gaia, un amministratore crea un nuovo recommendation_epoch in modalità live e aggiorna recommendation_profiles.active_epoch. I periodi precedenti rimangono archiviati; cronologie importate e catalogo restano intatti. Non c'è un pulsante pubblico per azzerare dati o cambiare modalità.

Le verifiche del servizio e della UI usano dispositivi registrati su un soggetto separato gaia-verification-*. Il parametro verifyDevice è accettato dalla UI solo dopo verifica del server che quel dispositivo appartenga davvero al soggetto di verifica. Nessun identificativo di verifica o dataset personale è incluso nei file pubblici.

## Sicurezza e verifiche

Tabelle private, RLS abilitato, accesso diretto revocato ad anon/authenticated; RPC solo service_role. La chiave service_role rimane nell'ambiente del backend. Il servizio pubblico preesistente conserva la sua configurazione JWT. I nuovi endpoint restituiscono esclusivamente identificativi del catalogo e badge; non restituiscono punteggi, statistiche delle cronologie, eventi o il modello. L'endpoint recommendationStats è esplicitamente negato. La pagina Statistiche preesistente resta invariata e non riceve cronologie importate.

Test Node: algoritmo centrale, duplicati, interleaving, sessioni/dispositivi, quote, catalogo e copertine. Test Python: normalizzatori Jellyfin/Netflix. Verifiche su Supabase: sequenza 4/20, contatore globale, sessione estranea rifiutata e ledger. Verifica browser: caricamento, navigazione, badge, ritorno e scelta. Lo storico importato attualmente contribuisce a 71 titoli del catalogo; altri titoli vengono associati quando diventano disponibili.

## Installazione riproducibile

Applicare schema-playback-history.sql prima di schema-central-recommendations.sql su un database nuovo. Sul database esistente usare migrazioni additive; non rieseguire la creazione del periodo iniziale. Pubblicare gaia-api con index.ts, central.js, recommendations.js e series-catalog.js. Non inserire TSV, snapshot dei fogli, modelli personali o query di importazione con dati nel repository.
