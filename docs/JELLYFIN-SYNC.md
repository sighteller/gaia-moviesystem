# Sincronizzazione Jellyfin

Connector Windows PowerShell 5.1 per Jellyfin 10.11.11, base locale `http://localhost:8096`.
Il pacchetto di installazione e le istruzioni sono in `windows-sync/`; la credenziale
dedicata al connettore viene distribuita privatamente fuori dal repository.

## Funzionamento

- Un'attività Windows dell'utente controlla Gaia ogni 15 minuti, con recupero delle
  esecuzioni perse. Richiede utente collegato; funziona anche con schermo bloccato.
- Il trasferimento completo avviene ogni 7 giorni dall'ultimo successo, o su
  richiesta da Gaia > Filtri > Aggiorna Jellyfin o dal comando Windows locale.
- Lettura paginata di tutti i Movie e Series, senza limitazione a una libreria.
  Esclusi episodi e segnaposto. I BoxSet vengono associati come nomi delle raccolte
  nei metadati privati del connettore, senza nuove schermate per le raccolte.
- Nessun video, percorso locale, utente o storico di visione viene trasferito.
- Le immagini Primary sono ridotte a 800 px di larghezza e copiate nel bucket
  pubblico `jellyfin-covers`. Oggetti immutabili per hash; immagini invariate non
  vengono ritrasferite. Checkpoint locale delle immagini per riprendere un upload
  interrotto. Le schede senza immagini sono comunque importate; ricerca di ulteriori
  alternative tramite il selettore TMDb esistente quando è presente l'ID TMDb.
- La chiave Jellyfin resta nel profilo Windows, cifrata con la protezione utente di
  Export-Clixml/SecureString. Il token Gaia ha accesso solo alle operazioni del
  connettore; sul server viene custodito solo il suo hash SHA-256.

## Importazione e disponibilità

Metadati a lotti di 25 in staging; commit SQL atomico solo dopo ricezione di tutti
gli ID distinti e seconda lettura del catalogo locale. Lease sul server con heartbeat
separato dall'ultimo contatto: un processo abbandonato può essere sostituito dopo
30 minuti, senza che i semplici controlli periodici ne rinnovino il blocco.

Associazione per item Jellyfin già noto, poi TMDb e tipo, poi nome esatto senza
distinzione maiuscole/minuscole e anno/tipo, con controllo su ID incompatibili.
Associazioni multiple rimangono da verificare. Unicità TMDb/tipo evita duplicati.
I nuovi titoli hanno categoria dedotta dai generi e stato `needs_review`.
Metadati già presenti e copertine scelte restano conservati; vengono riempiti solo
campi mancanti. Le disponibilità Jellyfin dei titoli gestiti dal connettore vengono
disattivate quando assenti da uno snapshot completo; schede, storico e altre
piattaforme rimangono. Associazioni Jellyfin preesistenti mai riconosciute dal
connettore restano da verificare manualmente: non vengono disattivate alla cieca.

Snapshot vuoti, di un altro server, incompleti o con riduzione >30% sono rifiutati.
Il limite di riduzione è intenzionale: prima verificare dischi e librerie, poi
valutare con l'operatore un'eventuale riduzione reale. Nessun titolo viene eliminato.

## Servizio e accesso

Edge `jellyfin-sync`, `verify_jwt=false`: status e richiesta sono pubblici come il
resto della webapp; richieste pendenti coalescenti, intervallo minimo 15 minuti.
Tutte le operazioni di importazione richiedono il token privato del connettore.
Le tre tabelle hanno RLS e privilegi revocati a anon/authenticated; solo service_role
accede alle RPC SECURITY INVOKER. Il bucket ha limite 1 MiB e accetta JPEG/PNG,
verificati dal servizio. Il programma non contiene una chiave service_role.
Per revocare il connettore: azzerare o sostituire connector_hash sul server e
redistribuire privatamente la nuova credenziale. Non pubblicare gli ZIP privati.
Le immagini immutabili obsolete rimangono nel bucket; nessuna cancellazione
automatica viene effettuata. Monitorare Storage se si cambiano molte copertine.

## Verifiche

14 test Node: suite esistente più normalizzazione, omissione dei dati privati,
validazione URL/immagini, scadenza settimanale, richiesta manuale e stati UI.
Test SQL sul database reale in una transazione con ROLLBACK: associazione TMDb,
cover conservata, ripetizione senza duplicati, rimozioni, snapshot incompleti,
riduzione eccessiva e lease concorrenti. Controlli HTTP live: stato pubblico,
rifiuto credenziali mancanti/errate, verifica connettore e prima esecuzione dovuta.
Nessun titolo di prova o associazione simulata rimane nel catalogo.
Advisor: tre segnalazioni informative RLS senza policy, coerenti con tabelle
riservate al servizio, senza accesso client. Nessun avviso di sicurezza.

Il programma non è stato eseguito su Windows o sul Jellyfin domestico: la prova
reale rimane l'esecuzione di Configura.cmd e della prima sincronizzazione.

## Correzione dopo prima prova Windows — 1 ottobre 2026

La lettura domestica ha trovato 435 titoli, ma l'avvio della sincronizzazione
era bloccato dalla protezione safeupdate della connessione HTTP al database:
`DELETE requires a WHERE clause` (SQLSTATE 21000). I precedenti test SQL diretti
non avevano la stessa protezione attiva. La pulizia ora riguarda soltanto il
run sostituito o righe temporanee vecchie di oltre un giorno. Una prova HTTP
autenticata dell'avvio con 435 titoli, tramite RPC con rollback interno, passa
e non lascia run, server fittizi o titoli di prova. La correzione è lato server;
il pacchetto originale può riprovare senza reinserire le chiavi.

Il pacchetto aggiornato mostra passaggio, codice HTTP e codice diagnostico
in caso di errore, senza stampare credenziali o payload. L'avvio manuale aggiorna
anche la copia usata dall'attività Windows quando è già installata.

## Raggruppamento Glee — 1 ottobre 2026

I 108 elementi nominati `1x01…` fino a `5x20…`, classificati Movie da Jellyfin,
sono stati identificati come Glee confrontando i titoli degli episodi. Stagioni
disponibili 1–5: 22, 22, 22, 22, 20 episodi. Ogni item conserva dati e ID originali,
ma title_id ora punta alla scheda serie TMDb 1417 già presente in Gaia. Le schede
singole sono archiviate con active=false, senza cancellare dati. La copertina
già scelta per Glee è conservata; disponibilità Jellyfin attiva sulla serie.

Il sincronizzatore riutilizza l'associazione item_id/title_id esistente e quindi
mantiene il raggruppamento anche se Jellyfin continua a classificare gli item
come Movie. Per associazioni di questo tipo la durata dell'episodio non viene
usata per riempire la durata della serie. Una ripetizione del catalogo completo
in transazione con rollback verifica assenza di nuovi duplicati, raggruppamento
conservato e durata invariata. Nessuna reinstallazione Windows è necessaria.
Nuovi episodi con ID mai visti e senza nome/ID della serie richiedono nuova
identificazione: il formato stagione/episodio da solo non identifica la serie.
