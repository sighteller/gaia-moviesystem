# Visione in corso

Il clic sulla piattaforma mantiene l’apertura del link in una nuova scheda e conferma la scelta come prima. Gaia passa a Visione in corso: citazione scelta (o frase standard), titolo, orario previsto di fine e conto alla rovescia. Nella pagina precedente rimane soltanto la battuta sul numero di titoli consultati, in grande.

Avvio, durata e fine prevista sono quelli della selezione salvata sul server. Il browser recupera l’ultima visione del proprio deviceId anche dopo chiusura/ricarica; i secondi non si azzerano. Lo stesso browser/dispositivo mantiene il deviceId. Senza cookie/dati locali o da un dispositivo diverso non è possibile ritrovare automaticamente questa associazione anonima.

Riaprire Gaia non interrompe più una visione. Il controllo di ritorno e il vecchio RPC gaia_check_viewing sono non distruttivi. Il nuovo endpoint checkViewing usa gaia_viewing_state tramite service_role. Il completamento presunto (80%) viene registrato al primo controllo server utile; la pagina rimane fino all’interruzione/ritorno esplicito. Un timer a zero non avvia altre scelte.

Interrompi visione usa il tempo server: sotto il 50% salva interrupted e wrong_choice=true; dal 50% a meno dell’80% salva interrupted e wrong_choice=false; dall’80% salva presumed_completed e wrong_choice=false. I valori percentuali e la durata non sono accettati dal client. La chiusura imposta viewing_dismissed_at, perciò la pagina non riappare. Un’interruzione non crea session_rejections e il segnale wrong_choice rimane distinto dal No durante lo scorrimento. Non sono stati cambiati i pesi dell’algoritmo. Il rewatch dopo un’interruzione esplicita non viene scartato come clic duplicato entro la vecchia durata.

Serie e titoli senza durata mantengono Visione in corso senza timer preciso; non vengono classificati come scelta sbagliata sulla base di una durata sconosciuta. Tempo trascorso stimato: nessuna integrazione con pause/playback di servizi esterni.

Persistenza: selections.wrong_choice, selections.viewing_dismissed_at e funzione service-only gaia_viewing_state. Nessuna nuova tabella pubblica né concessione anonima di esecuzione alla funzione privilegiata. Gli advisor mantengono le 16 segnalazioni informative preesistenti per tabelle private con RLS e nessuna policy; nessun nuovo avviso.

Verifiche: transazione SQL con rollback a 49,9%, 50%, 79,9%, 80% e 100%; ripristino e chiusura persistente, compatibilità letture vecchie. Test del timer da timestamp dopo ricarica, zero e durata sconosciuta. Collaudo API su profilo di verifica separato: apertura, letture ripetute senza azzeramento e finalize duplicato idempotente. Nessuna riproduzione o email reale.
