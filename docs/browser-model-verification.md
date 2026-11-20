# Verifica del trasferimento nel browser · 20 novembre 2026

## Calcoli

- Le matrici MediaPipe Web sono column-major. Il codice normalizza le colonne e calcola la rotazione ortogonale più vicina prima di estrarre gli angoli xyz, come SciPy nella ricerca originaria.
- 35 matrici sintetiche, incluse matrici perturbate e con scale diverse, coincidono con i riferimenti SciPy entro 1e-10 radianti. I dati sintetici e le caratteristiche di riferimento sono in tests/fixtures/browser-model-golden.json.
- Sugli stessi vettori di posa estratti dagli otto filmati originali, 2.758 campioni, di cui 1.983 valutabili, il calcolo JavaScript delle caratteristiche e dei punteggi coincide con Python con errore massimo 2,23e-16. I dati privati usati per questa verifica non fanno parte del sito o del repository. Il fotogramma attuale mancante produce sempre astensione, anche quando una misura precedente è ancora entro la finestra.

Questa è parità dei calcoli sugli stessi vettori, non una nuova misura dell’accuratezza del classificatore.

## Estrazione delle immagini

Il motore reale WebAssembly è stato eseguito nel browser sul sito statico di anteprima, senza il servizio Python. Un video di controllo senza viso produce Non valutabile e risultati esportabili. Un filmato privato di controllo con un volto fermo ha prodotto 80 rilevamenti. Nel confronto con Python dello stesso filmato, la differenza mediana degli angoli è 0,00249 rad e quella massima 0,01145 rad, circa 0,66°. Differenze dei decoder, ridimensionamento e SDK impediscono di promettere identità dei punteggi su immagini reali. La prova è sul trasferimento dell’estrattore, non su gesti o intenzioni; non sostituisce prove con filmati nuovi.

## Flusso e integrazione

I nuovi test Node verificano:

- importazione compatibile e rifiuto dei file di annotazioni;
- causalità, astensione e memoria limitata;
- Si continuo per più di due secondi senza riposo preliminare, nuova lettura dopo la domanda e un solo evento di scelta;
- ritorno a non-sì, perdita del volto, grandi interruzioni, cambi di titolo e pagina nascosta;
- tempo scaduto distinto da rifiuto e scansione delle categorie;
- worker e webcam simulati, permesso negato, interruzione delle tracce e chiusura del worker.

I 14 nuovi controlli passano. Nell’intera suite della versione di partenza più questi controlli, 42/44 passano. Due controlli centrali preesistenti falliscono con `Unknown RPC gaia_viewing_state`; lo stesso esito è stato riprodotto sulla copia intatta del commit di partenza 0b4fd55c00b74a23f7d8127d67c644d1a77813a0. Non sono stati modificati backend, schema o logica di registrazione centrale.

L’anteprima del sito principale carica il catalogo e apre il nuovo pannello dal pulsante webcam. Il permesso della webcam reale dell’operatore non viene attivato per le prove automatiche: il comportamento di acquisizione è verificato con MediaStream simulato; l’estrazione reale con i filmati caricati nella pagina di prova.

## Primo test di utilizzo

Importare il modello personale sul sito una sola volta, poi provare un filmato nuovo in camera-test.html. Valutare sia sì mancati sia possibili sì nei tratti non annotati. Ripetere con la webcam nelle condizioni reali, con i comandi manuali disponibili. Le correzioni si conservano come annotazioni; non modificano automaticamente il modello durante la prova.

## Correzione della selezione dopo la prova dell’utente

Eliminati il riarmo obbligatorio da riposo e la pausa permanente dopo i clic manuali. Un Si continuo oltre 2.000 ms apre la conferma, anche se presente fin dall’inizio della lettura utile. No/Riposo avanza a 2, 3, 4, 5, 7 o 10 secondi; Incerto e Non valutabile non fanno avanzare. La lettura Si durante la proposta conta anche mentre viene letto il nome dell’opzione; la domanda di conferma deve invece terminare prima di acquisire la risposta finale.

Test di regressione verificano l’apertura della conferma, l’assenza di un evento prima dei due secondi, la nuova lettura dopo la domanda, i sei intervalli, l’interruzione del gesto, i clic manuali e un solo evento di scelta. I test dell’interfaccia usano un MediaStream e un worker simulati, senza azionare la webcam reale dell’operatore.
