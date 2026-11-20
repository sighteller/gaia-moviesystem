# Modello personalizzato nel browser

Il pulsante webcam del sito principale usa il modello personalizzato di Gaia. Non contatta il servizio locale Python e non richiede installazioni o programmi da avviare sul computer. L’accesso alla webcam rimane esplicito e il microfono non viene richiesto.

## Modello del sito

Il modello viene caricato e sostituito da **Impostazioni → Modello di Gaia**. La webcam e la prova video lo recuperano automaticamente dal sito, anche su un browser o dispositivo nuovo. La copia già scaricata nel browser è soltanto una cache; non è più l’unica sorgente del modello. Il modello attuale è già configurato.

Scegliere un file prepara e verifica il modello, senza cambiare quello attivo. Premere **Salva modello sul sito** applica la sostituzione a tutti i dispositivi. Un modello incompatibile viene rifiutato e una sostituzione durante la lettura richiede di riavviarla. La webcam non viene attivata automaticamente al caricamento della pagina. Vedere `shared-camera-model.md` per salvataggio, sincronizzazione e accesso.

## Uso

Premere di nuovo la videocamera. Il riconoscitore viene scaricato su richiesta; poi viene richiesto video soltanto. Mantenere per i primi tre secondi la postura di riposo comoda di oggi, anche inclinata. **Rifai riferimento di riposo** raccoglie un riferimento nuovo senza modificare il modello. La guida di posizionamento facoltativa resta distinta dal riferimento e non impone una testa dritta.

Dopo il riferimento, Gaia può rispondere all’avvio e alle categorie. Il tempo per ogni opzione si sceglie nel pannello: **2, 3, 4, 5, 7 o 10 secondi**, inizialmente 5. Lo stesso intervallo vale per le categorie e per i film. La lettura mostra **Si**, **No/Riposo**, **Incerto** e **Non valutabile**; gli stati interni e i punteggi del modello restano invariati.

La prima selezione e la conferma richiedono entrambe **almeno 1,5 secondi effettivi di Si negli ultimi 2,5 secondi**. Non serve rimanere immobili: gli intervalli Incerto non contano come Si ma conservano le letture valide ancora nella finestra. Anche una breve perdita del volto conserva tali letture, senza aggiungere tempo positivo; dopo almeno 750 ms consecutivi senza volto il conteggio viene azzerato e una conferma aperta viene annullata. Un Si isolato non resta in memoria oltre la finestra.

Quando la prima soglia viene raggiunta si apre **Sei sicura?**. La domanda, anche parlata, è soltanto «Sei sicura?», senza il nome del film. Il conteggio riparte da zero e, se la domanda è pronunciata, inizia solo dopo la fine dell’audio. La risposta iniziale non può confermare il film. La scelta finale avviene soltanto su una lettura corrente Si; Incerto e Non valutabile non possono far scattare un’azione. Dopo la conferma, modalità e piattaforma restano manuali.

Un **No/Riposo** esplicito azzera il gesto e annulla la conferma tornando allo stesso titolo. Durante la scansione fa avanzare allo scadere dell’intervallo scelto, tramite `nextMovie(false)`: il tempo scaduto non diventa un rifiuto registrato. Incerto e Non valutabile sospendono quel timer; un Si lo azzera. Cambi di opzione, pause manuali, pagina nascosta e interruzioni dei risultati superiori a 350 ms scartano la storia del gesto. I comandi manuali non lasciano la webcam in pausa permanente. **Riprendi scelta** permette di ricominciare.

## Prova con video

Il collegamento **Prova il modello con un video** apre `camera-test.html`, con lo stesso modello condiviso salvato nelle impostazioni. Caricare un filmato, avviare la lettura e mettere in pausa per segnare sì/riposo/casi dubbi. Le annotazioni precedenti possono essere importate nella sezione Le tue annotazioni, con associazione al filmato originale o collegamento esplicito al file rinominato. Si possono scaricare annotazioni e risultati della singola prova. I fotogrammi non visitati non vengono trattati come riposo né come previsioni corrette; il confronto controlla i punti etichettati, il centro degli intervalli.

Il ritaglio automatico cerca il volto nel fotogramma intero e in finestre sovrapposte. Il ritaglio manuale della prova video è facoltativo; cambiarlo richiede una nuova lettura dall’inizio. Gli spostamenti nel filmato scartano la storia recente e le risposte pendenti, mantenendo il riferimento iniziale dello stesso video.

## Esecuzione e dati

MediaPipe Web 0.10.21, modalità IMAGE e CPU, eseguito in un Web Worker classico: il caricatore WASM del pacchetto usa importScripts e non funziona come worker module. Il codice applicativo viene importato come modulo dal worker. Il task ufficiale del volto è float16/1; SHA-256 atteso `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. Non si usano versioni latest, né si riaddestra il modello. Le risorse iniziali richiedono connessione; non è promesso l’avvio completamente offline.

Le immagini sono trasferite al worker del dispositivo, senza richieste HTTP contenenti fotogrammi, audio, punti del volto o coefficienti personali. La memoria contiene solo riferimento iniziale e storia recente limitata; le immagini vengono liberate dopo l’inferenza. L’anteprima a specchio non modifica l’immagine analizzata. Disattivare la webcam interrompe le tracce, termina il worker, annulla richieste, animazioni, sintesi vocale e stato della scelta. La pagina di prova conserva i risultati fino al cambio sorgente/modello o a una nuova prova, per consentirne l’esportazione.

Il modello è piccolo e contiene 12 caratteristiche di posa/movimento. Non riconosce identità o intenzioni. Le soglie congelate sono ≥0,70 possibile sì, ≤0,30 riposo, altrimenti incerto. La verifica sperimentale sui filmati nuovi di Gaia rimane necessaria. Vedere `browser-model-verification.md` per controlli e limiti del trasferimento.
