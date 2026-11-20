# Modello condiviso dalle impostazioni

## Uso

Impostazioni → Modello di Gaia mostra il file attivo, la versione e la data. Carica modello di Gaia prepara e verifica il JSON; **Salva modello sul sito** lo rende attivo per webcam e pagina di prova su tutti i browser e dispositivi. Scarica modello attivo permette di conservarne una copia. Video, annotazioni e file incompatibili vengono rifiutati prima del salvataggio.

Il modello iniziale è già stato salvato nella configurazione del sito. Non occorre importarlo una volta per ogni browser. Aprendo la pagina o attivando la webcam viene recuperata la versione condivisa. Un collegamento diretto alla sezione è `index.html?settings=model`.

Una copia già verificata viene conservata sul dispositivo per non dipendere dalla connessione a ogni fotogramma. Attivazione, ritorno alla pagina e controllo periodico ricontrollano la configurazione del sito. Una nuova versione ferma la lettura in corso: riavviarla raccoglie un riferimento coerente con il nuovo modello. I risultati di vecchie prove non vengono presentati come risultati del nuovo modello.

## Configurazione e API

`public.gaia_camera_model` contiene una sola configurazione, con revisione monotona, impronta SHA-256, nome file e data. L’ultima configurazione precedente è conservata per recupero amministrativo; non viene restituita ai client. La tabella ha RLS e nessun accesso diretto per anon/authenticated. La funzione SQL è SECURITY INVOKER, eseguibile soltanto dal servizio server.

Le operazioni `cameraModelGet` e `cameraModelSave` sono aggiunte all’Edge Function già esistente gaia-catalog, mantenendone l’accesso del sito e la configurazione JWT preesistente. Come per l’editor del catalogo, non viene introdotto un account separato: la configurazione attiva è distribuita ai browser che usano il sito. Non presentare il controllo Origin/CORS come autenticazione contro client esterni. Il server conserva la chiave privilegiata nel proprio ambiente e non la include mai nei file del sito.

Sono salvati soltanto i parametri del classificatore necessari al browser; nomi dei video di addestramento, elenchi dei filmati e metadati aggiuntivi del file non vengono distribuiti. Il JSON del modello non è inserito nel repository pubblico. I fotogrammi rimangono elaborati nel browser; questa API non riceve video, audio o pose rilevate.

La sostituzione è atomica con expected_revision. Due pagine non possono sovrascriversi senza rilevare un conflitto. Lo stesso modello ripetuto dopo una risposta persa è idempotente. Un conflitto restituisce HTTP 409 con SQLSTATE PT409; non viene usata una serializzazione fallita per rappresentare un conflitto applicativo. Un errore, un file non valido o un conflitto non sostituiscono il modello attivo.

Il client verifica schema e impronta del record scaricato; un GET lento non può ripristinare una revisione precedente a un salvataggio già riuscito. In assenza di connessione, la webcam può utilizzare soltanto una copia condivisa precedentemente scaricata. Le impostazioni non dichiarano riuscito un salvataggio se il server non lo conferma.

## Verifiche

- Test del client: nuovo browser, cache offline, impronte non valide, ritardo GET rispetto a Save, errore/conflitto senza perdita del modello attivo.
- Test del pannello: scelta del file senza salvataggio implicito, file sbagliati, salvataggio esplicito, conflitto e richiesta di nuova conferma dopo aver mostrato la versione aggiornata.
- Test del server: validazione prima della scrittura, rimozione dei metadati di addestramento, conflitti e assenza di chiavi/errori privati nelle risposte.
- Test della webcam: una nuova configurazione ferma tracce e worker prima di usare altri parametri.
- Verifica SQL sul database effettivo: revisione, copia precedente, idempotenza, conflitto e rollback della prova; anon/authenticated non possono leggere la tabella né invocare la sostituzione.
- Verifica HTTP sul servizio effettivo: lettura da client, salvataggio idempotente, rifiuto annotazioni, rifiuto della revisione superata e impronta/revisione rimaste invariate.

La suite completa sulla base corrente contiene quattro errori preesistenti, estranei a questa modifica: due mock della cronologia centrale non riconoscono gaia_viewing_state; due test delle citazioni richiedono testo/autore anche per le voci intenzionalmente vuote. Le nuove verifiche sul modello e sul pannello passano.

L’advisor segnala a livello INFO l’assenza di policy RLS su questa tabella: è intenzionale, per negare l’accesso diretto ai client e far passare i dati dall’Edge Function. I grant anon/authenticated sono esplicitamente revocati. [Descrizione dell’avviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
