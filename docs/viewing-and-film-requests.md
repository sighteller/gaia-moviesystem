# Visioni e richieste (4 ottobre 2026)
Al primo ritorno su Gaia, una selezione in corso diventa interrotta prima dell'80% della durata o presumibilmente completata dall'80% in poi. Il tempo è una stima di orologio, non la posizione del player. La durata del film viene salvata con la selezione. Per serie o durate sconosciute non si presume il completamento. Lo storico precedente resta invariato.
Il controllo avviene caricando Gaia o il catalogo e tornando sulla scheda visibile. Richiede connessione e lo stesso dispositivo/browser.

## Richiedi film
Aggiungi titolo → ricerca TMDb → scegli titolo e cover → Richiedi film. La richiesta entra nel catalogo in cima, in verde; resta esclusa dalla selezione finché disponibile. Dal catalogo: indica piattaforme/link, premi Rendi disponibile e Salva modifiche. Le richieste duplicate non aggiungono un secondo titolo. I record risolti conservano lo stato anche se archiviati.
Le notifiche sono registrate in film_request_notifications, accessibile solo al servizio. Nessun indirizzo o segreto viene accettato dal browser.

## Email da configurare
L'invio è predisposto tramite Resend, ma non è attivo senza tutti questi segreti nella funzione image-curator:
- RESEND_API_KEY
- FILM_REQUEST_EMAIL_FROM: mittente verificato su Resend
- FILM_REQUEST_EMAIL_TO: destinatario confermato dall'utente
Il destinatario scritto dall'utente termina in gmail.ocm: chiedere conferma prima di configurarlo. Nessun destinatario è stato impostato.
Una nuova richiesta resta salvata anche se manca la configurazione o l'invio fallisce. La coda già esistente NON viene svuotata automaticamente configurando i segreti: le notifiche precedenti richiedono un invio amministrativo separato. Non offrire un endpoint pubblico per ritentare email.
Documentazione: https://resend.com/docs/api-reference/emails/send-email

## Verifiche
Test database con rollback: 45% interrotto, 80% completato, primo ritorno immutabile; richiesta non disponibile, idempotente, notifica in coda, stato risolto preservato dopo archivio. Nessun record di prova persistente, nessuna email di prova inviata. Pubblicazione via connettori, senza download o installazioni sul PC.
