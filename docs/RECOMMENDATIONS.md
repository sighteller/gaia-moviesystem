# Ordinamento dei film — prima versione

## Scopo e candidati

Ordinare il catalogo approvato caricato nella webapp, rispettando categoria e piattaforme selezionate. Nessuna ricerca automatica di film esterni e nessuna domanda a Gaia. I titoli di Jellyfin sono già conosciuti; Netflix e Disney vengono aggiunti al catalogo dal gestore. La gestione delle serie esistente resta invariata.

## Punteggio

`recent + repeats + history + seed - unusedOfferPenalty`

- Recenza: massimo 40, dimezzato ogni 3 giorni dall'ultimo click verso la piattaforma.
- Ripetizioni: massimo 30, bonus con rendimenti decrescenti; memoria recente dimezzata ogni 7 giorni. La stessa scelta prima della fine prevista non aggiunge una visione e non rinnova il tempo precedente.
- Preferenza storica: massimo 20, crescita logaritmica su giorni storici Netflix e nuove scelte. Le scelte interrotte da un altro film riducono il contributo recente; sono indizi, non voti.
- Preferenza iniziale: massimo 10, dai primi 50 titoli del foglio Netflix (49 dopo Harry Potter). Conta giorni con almeno 10 minuti cumulati, non il numero di sessioni Netflix o visioni complete. Date storiche non diventano attività recente.
- Titolo recente riproposto senza scelta: −8. Titolo non recente: −2. “No” esplicito aggiunge rispettivamente −4 o −1. “Recente” significa almeno 10 punti di recenza (circa 6 giorni). Le penalità si dimezzano ogni 14 giorni.
- Una scheda si conta una volta per titolo/sessione quando viene renderizzata, mai quando è solo preparata. Tornare indietro non crea esposizioni. La scelta successiva dello stesso titolo in quella sessione annulla la sua penalità e rinnova l'interesse, salvo il caso di riavvio anticipato.
- Le penalità incidono alla sessione successiva: ordine e schede già consultate restano stabili.

Valori iniziali configurabili nel modulo puro `recommendations.js`; non sono una calibrazione validata sull'uso reale di Gaia.

## Composizione dell'ordine

Ogni 4 nuove schede mostrate: spunto nella metà inferiore della graduatoria. Ogni 20: underdog nell'ultimo quinto, al posto dello spunto. Il contatore continua tra categorie e sessioni e si conserva al ricaricamento.

Rotazione ponderata: priorità alla minore esposizione totale divisa per un peso derivato dal punteggio (limitato fra 0.25 e 1); a parità, prima il meno recentemente proposto. I titoli più bassi attendono di più, mantenendo una possibilità finita di tornare. Tutte le proposte effettive, anche regolari, partecipano al conteggio.

Uno spunto/underdog effettivamente mostrato non torna nella sessione successiva, nemmeno come proposta ordinaria, salvo che sia stato scelto e promosso tra i recenti. Non si ripete lo stesso titolo nuovo nella stessa sessione. Se mancano candidati speciali, lo spazio diventa ordinario. Esaurito un catalogo piccolo, si può ripercorrere la sequenza già vista senza nuovi addebiti. In cataloghi insufficienti l'underdog è quindi “circa ogni 20”, non una ripetizione forzata.

Il simbolo Scopri originale appare sotto l'anno per gli spunti; la clessidra per gli underdog. Nessun testo tecnico viene aggiunto alla scelta di Gaia.

## Dati e controlli

Prima versione su un singolo browser/dispositivo, `localStorage.gaia_recommendations_v1`. Lo storico Supabase delle prove preesistenti non è letto dal motore. Modalità iniziale “Prove”; la modalità “Uso di Gaia” parte da zero con un comando esplicito nelle impostazioni. Le preferenze iniziali Netflix restano presenti dopo l'azzeramento.

Esporta/ripristina backup permettono di conservare o trasferire i dati. Non usare navigazione privata o cancellare i dati del browser senza un backup. Non esiste ancora sincronizzazione del modello tra dispositivi; più schede dell'app aperte simultaneamente possono sovrascrivere gli aggiornamenti. L'azzeramento del motore non cancella statistiche o catalogo Supabase.

Il matching dello storico è conservativo: titolo italiano/originale normalizzato per accenti e punteggiatura. Nessun confronto approssimativo fra remake o sequel. I titoli storici mancanti non sono importati automaticamente; entrano nel calcolo se aggiunti in seguito con un nome corrispondente. Controllo sul catalogo del 6 ottobre: 21 corrispondenze testuali univoche dei 49 titoli. Restano da verificare eventuali nomi alternativi.

## Verifiche

`node --test tests/*.test.mjs`: simulazioni di recenza, ripetizioni, rapida discesa dopo proposte non scelte, rotazione, esclusione tra sessioni, contatore globale, cataloghi piccoli, reset, persistenza e icone.

Verifica browser con 100 titoli simulati: ordine iniziale, schede 4 e 20, badge sotto l'anno, avanti/indietro, seconda sessione, avvio al click sulla piattaforma, reset e ricaricamento. Nessun evento di verifica viene scritto nel catalogo reale.

La versione corrente pubblicata contiene già la gestione dei ritorni dalla piattaforma con soglia dell'80%: rimane invariata. Il nuovo modello usa soltanto i propri eventi di scelta al click, non interpreta come visione effettiva i dati temporali.
