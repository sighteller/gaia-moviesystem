# Posizione webcam

Attivare la webcam, sistemare la carrozzina e premere **Memorizza posizione**. Tenere una postura comoda per circa tre secondi con un solo viso interamente visibile. Una cattura troppo instabile viene rifiutata senza sostituire il riferimento precedente. Il pulsante può essere riutilizzato per sostituirlo; **Cancella riferimento** lo rimuove.

Il riferimento viene conservato solo nel localStorage del browser (`gaia_camera_position_v1`): centro e dimensioni normalizzati del viso, versione del formato e rapporto dell’inquadratura. Non contiene immagini, video, punti facciali o informazioni di identità e non viene inviato al server. Non si trasferisce su un altro dispositivo. Se si sposta la webcam, rifare il riferimento.

L’ovale segue le coordinate dello stesso video senza ritaglio, con la stessa specchiatura orizzontale. Il verde richiede circa un secondo di posizione compatibile. Tolleranze indicative: dimensione lineare 82–122%, centro entro 3,5% del fotogramma o 18% della dimensione del viso. Un rapporto d’inquadratura diverso di oltre 8% richiede un nuovo riferimento. Non è una misura in centimetri e non garantisce il riconoscimento dei gesti.

La cattura sospende temporaneamente le risposte sì/no. Terminata la cattura, la domanda iniziale riparte dopo cinque secondi. La guida non blocca le risposte quando Gaia si muove: la calibrazione dei gesti rimane distinta. Chiusura webcam, più visi, viso fuori campo o passaggio in background interrompono la cattura. Nessun permesso webcam richiesto al caricamento della pagina.

Verifiche: geometria con posizione uguale, distanza/offset errati, assenza di viso, cambio proporzioni, cattura stabile/instabile e dati locali corrotti; controllo sintattico del modulo. La verifica fisica di postura/tolleranze e permessi webcam va svolta sul dispositivo dell’utente.
