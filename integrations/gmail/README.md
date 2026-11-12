# Notifiche richieste film tramite Gmail

Il backend supporta Google Apps Script/MailApp, senza dominio e senza accesso alla posta in arrivo. Non è attivo finché si completa la configurazione Google e Supabase. Nessun indirizzo personale o segreto va inserito nel repository.

## Configurazione una tantum

1. Aprire https://script.google.com con l'account Gmail che deve inviare le email; creare un progetto “Gaia notifiche”.
2. Copiare il contenuto di [Code.gs](Code.gs) nell'editor, senza scaricare file.
3. Nelle impostazioni del progetto abilitare la visualizzazione del manifest e sostituire appsscript.json con il [manifest allegato](appsscript.json). I soli permessi sono invio email e identificazione del mittente.
4. Nelle **Proprietà script** aggiungere GAIA_MAIL_SENDER (indirizzo Gmail mittente) e GAIA_MAIL_RECIPIENT (indirizzo destinatario concordato).
5. Eseguire initialiseGaiaMailer e autorizzare l'account: genera GAIA_MAIL_SECRET nelle proprietà, senza stamparlo nei log.
6. Eseguire sendGaiaTestEmail per inviare una sola email di prova al destinatario configurato.
7. **Esegui deployment → Nuovo deployment → Applicazione web**: esegui come proprietario, accesso “Chiunque”. Il collegamento pubblico accetta solo POST firmate dal backend; il destinatario non può essere scelto dalla richiesta. Copiare l'URL che termina in /exec, non /dev.
8. Nei [secret Edge Functions Supabase](https://supabase.com/dashboard/project/mahjewznwqvdgtdjtekc/functions/secrets) impostare GMAIL_BRIDGE_URL con quell'URL e GMAIL_BRIDGE_SECRET con il valore di GAIA_MAIL_SECRET. Non incollare il segreto in chat o nel codice pubblico.
9. Verificare con una nuova richiesta reale da Gaia: il titolo deve restare nelle richieste del catalogo e l'email deve arrivare. Controllare film_request_notifications.status = sent; non creare titoli fittizi nel catalogo.

Il mittente effettivo è sempre l'account proprietario che autorizza lo script. Un altro account non può inviare usando il mittente configurato.

## Comportamento e limiti

- Si invia solo per una nuova richiesta, non per le richieste pregresse o duplicate.
- Una firma HMAC-SHA256 protegge titolo, identificativo e timestamp; validità cinque minuti e tolleranza futura un minuto.
- Invii già registrati per lo stesso titolo non vengono ripetuti. Un lock serializza i tentativi. Un arresto eccezionale tra invio e registrazione può comunque causare un duplicato.
- Quota esaurita, configurazione errata o errore Google non annullano la richiesta: il backend registra l'errore. Non è presente un tentativo automatico programmato.
- Per gli account personali Google indica attualmente 100 destinatari/giorno; le quote possono cambiare. Una notifica ha un destinatario.
- Se Gmail è parzialmente configurato non si usa un altro provider di nascosto. Resend rimane compatibile solo quando entrambi i secret Gmail sono assenti.
- Non eliminare le proprietà GAIA_SENT_* se si vuole mantenere la protezione dai duplicati. La memoria delle proprietà ha un limite: per volumi elevati occorrerà una manutenzione del registro.
- Dopo modifiche al codice Apps Script aggiornare il deployment a una nuova versione.

## Test

Da un checkout già disponibile con Node: `node tests/gmail-notifications.test.mjs`. Usa solo simulazioni: nessuna email reale, nessuna dipendenza aggiuntiva.

Fonti ufficiali: [Web app](https://developers.google.com/apps-script/guides/web), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [quote](https://developers.google.com/apps-script/guides/services/quotas).
