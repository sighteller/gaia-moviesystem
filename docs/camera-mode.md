# Modello personalizzato nel browser

Il pulsante webcam del sito principale usa il modello personalizzato di Gaia. Non contatta il servizio locale Python e non richiede installazioni o programmi da avviare sul computer. L’accesso alla webcam rimane esplicito e il microfono non viene richiesto.

## Primo utilizzo

Aprire la videocamera, espandere Modello e inquadratura e scegliere **Carica modello di Gaia** con il file JSON del classificatore. Il file è letto sul dispositivo e conservato in localStorage per questa origine. Non viene pubblicato nel repository né inviato a un server. Video di addestramento, annotazioni ed esempi del vecchio calibratore non sono modelli e non vengono importati come tali. Un modello incompatibile viene rifiutato con un messaggio.

Il modello viene ritrovato alle visite successive nello stesso browser; un altro browser o dispositivo richiede l’importazione. In caso di salvataggio locale non consentito rimane utilizzabile nella pagina aperta, con avviso. La webcam non viene attivata automaticamente al caricamento o al ritorno sul sito.

## Uso

Premere di nuovo la videocamera. Il riconoscitore viene scaricato su richiesta; poi viene richiesto video soltanto. Mantenere per i primi tre secondi la postura di riposo comoda di oggi, anche inclinata. **Rifai riferimento di riposo** raccoglie un riferimento nuovo senza modificare il modello. La guida di posizionamento facoltativa resta distinta dal riferimento e non impone una testa dritta.

Dopo il riferimento, Gaia può rispondere all’avvio e alle categorie. Le categorie vengono proposte a turno per otto secondi. Nei film, il tempo per titolo si sceglie nel pannello (10, 15, 20 o 30 secondi). La lettura distingue Possibile sì, Riposo, Incerto e Non valutabile.

Un sì stabile per 0,4 secondi ferma lo scorrimento. Dopo tre secondi, se il sì è ancora stabile e i dati sono freschi, appare e viene letta **Sei sicura?**. Occorre ancora un sì rilevato dopo la domanda per almeno 0,4 secondi; non è richiesto un ritorno al riposo. Se il sì scompare prima della verifica, si riprende sullo stesso titolo. Dopo la conferma del film, le schermate per registrare modalità e piattaforma restano manuali.

Il tempo di scorrimento avanza con letture utilizzabili senza un sì, compresa la fascia intermedia del punteggio: l’assenza di un sì non è un rifiuto. L’avanzamento chiama il percorso esistente `nextMovie(false)` e non invia rejectTitleId per il film precedente. Un punteggio intermedio non può selezionare o confermare niente. Viso mancante, storia insufficiente, risultati scaduti, domande parlate, passaggi in caricamento e pagina nascosta sospendono gli automatismi. Una nuova scheda, schermata o proposta richiede nuovamente una breve lettura non-sì prima di accettare il gesto successivo. Intervenire sui comandi manuali mette in pausa la scelta automatica; **Riprendi scelta** la riattiva.

## Prova con video

Il collegamento **Prova il modello con un video** apre `camera-test.html`, sulla stessa origine del sito e con lo stesso modello memorizzato. Caricare un filmato, avviare la lettura e mettere in pausa per segnare sì/riposo/casi dubbi. Le annotazioni precedenti possono essere importate nella sezione Le tue annotazioni, con associazione al filmato originale o collegamento esplicito al file rinominato. Si possono scaricare annotazioni e risultati della singola prova. I fotogrammi non visitati non vengono trattati come riposo né come previsioni corrette; il confronto controlla i punti etichettati, il centro degli intervalli.

Il ritaglio automatico cerca il volto nel fotogramma intero e in finestre sovrapposte. Il ritaglio manuale della prova video è facoltativo; cambiarlo richiede una nuova lettura dall’inizio. Gli spostamenti nel filmato scartano la storia recente e le risposte pendenti, mantenendo il riferimento iniziale dello stesso video.

## Esecuzione e dati

MediaPipe Web 0.10.21, modalità IMAGE e CPU, eseguito in un Web Worker classico: il caricatore WASM del pacchetto usa importScripts e non funziona come worker module. Il codice applicativo viene importato come modulo dal worker. Il task ufficiale del volto è float16/1; SHA-256 atteso `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. Non si usano versioni latest, né si riaddestra il modello. Le risorse iniziali richiedono connessione; non è promesso l’avvio completamente offline.

Le immagini sono trasferite al worker del dispositivo, senza richieste HTTP contenenti fotogrammi, audio, punti del volto o coefficienti personali. La memoria contiene solo riferimento iniziale e storia recente limitata; le immagini vengono liberate dopo l’inferenza. L’anteprima a specchio non modifica l’immagine analizzata. Disattivare la webcam interrompe le tracce, termina il worker, annulla richieste, animazioni, sintesi vocale e stato della scelta. La pagina di prova conserva i risultati fino al cambio sorgente/modello o a una nuova prova, per consentirne l’esportazione.

Il modello è piccolo e contiene 12 caratteristiche di posa/movimento. Non riconosce identità o intenzioni. Le soglie congelate sono ≥0,70 possibile sì, ≤0,30 riposo, altrimenti incerto. La verifica sperimentale sui filmati nuovi di Gaia rimane necessaria. Vedere `browser-model-verification.md` per controlli e limiti del trasferimento.
