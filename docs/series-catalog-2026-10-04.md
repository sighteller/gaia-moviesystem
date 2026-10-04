# Catalogo: serie, stagioni ed episodi — 4 ottobre 2026

## Comportamento
Il catalogo mostra una sola voce per serie. La voce apre le stagioni e le schede degli episodi; i dati della serie hanno un riquadro separato «Modifica dati della serie». Le bozze degli episodi partecipano allo stesso Salva modifiche del catalogo. Ricerca e filtri trovano anche gli episodi e mantengono il contesto della serie. Le aperture restano conservate tra i render della pagina.

Nella selezione e in Scopri vengono proposti soltanto i titoli principali delle serie. La conferma e i link diretti alle piattaforme continuano a riferirsi alla serie, senza selezione automatica di un episodio.

## Dati preservati
Aggiunte a titles: series_id (FK senza cancellazione a cascata), season_number, episode_number, season_collections (raccolte di stagione identificate). Gli episodi mantengono ID, nome originale, copertine, citazioni, disponibilità, stato active e riferimenti dello storico. Non sono stati cancellati o riattivati record.

Associazioni verificate:
- Glee: 108 record già archiviati e riconosciuti dagli stessi ID Jellyfin; stagioni 1–5. Restano archiviati e sono consultabili sotto la serie.
- Saranno famosi: 19 episodi attivi della stagione 3, associati per prefisso esatto al titolo della serie.
- Saranno famosi: raccolte Jellyfin S1 e S2 mantenute come raccolte, senza inventare i singoli episodi.

424 record conservati; 297 film/serie principali; 127 episodi raggruppati. Le altre serie possono avere soltanto il titolo principale: l’interfaccia segnala che l’inventario degli episodi non è ancora disponibile. I file B1 e le raccolte dei Simpson da identificare non sono stati associati automaticamente. Il film Fame - Saranno famosi rimane distinto dalla serie.

## Statistiche
Gli ID episodio restano disponibili per future preferenze e rewatch. Le scelte passate salvate a livello di serie NON vengono attribuite a un episodio ipotetico. Prima di misurare preferenze episodio servono una scelta esplicita dell’episodio o eventi di riproduzione Jellyfin legati al suo identificativo. Questa modifica non presume che una scelta sia una visione completata.

## Sincronizzazioni future
La sincronizzazione esistente conserva le colonne aggiunte. Nuovi titoli con prefisso e numero stagione/episodio vengono raggruppati nell’interfaccia soltanto quando il prefisso corrisponde a una sola serie esistente. Per alimentare tutti gli episodi delle serie native occorre estendere l’inventario Jellyfin con Season/Episode e gli ID della serie; non sono stati inventati dati mancanti. Le season_collections rappresentano l’inventario verificato il 4 ottobre e andranno aggiornate con quell’estensione.

## Verifica
Test di raggruppamento, ordinamento numerico, ricerca episodio, archivio, bozze, rinomina, orfani e prefissi ambigui in tests/series-catalog.test.mjs.
Nessuna modifica a RLS, privilegi o funzioni di salvataggio. La revisione del catalogo include automaticamente le nuove colonne e continua a rilevare modifiche concorrenti.
