# Gaia | Movie System

Sito: https://sighteller.github.io/gaia-moviesystem/

Nuove funzioni: “Aggiungi titolo” amministrativo con ricerca TMDb, cover TMDb +
Fanart.tv e importazione atomica; “Scopri” dal catalogo con rewatch positivi.
Configurazione, limiti e ricerca fonti: [Image Curator e Scopri](docs/IMAGE-CURATOR.md).

Test (Node 24): `node --test tests/*.test.mjs`.

Prototype webapp for assisted movie selection.

## Current features
- Categories: Animazione / Film
- Platform filters
- Keyboard + mouse navigation
- Right arrow = reject + next
- Left arrow = undo previous rejection + go back
- Enter = confirmation screen
- Platform selection
- Limited / Unlimited choice mode
- 20 minute resumable sessions
- Persistent mute (`M`)
- Automatic marking of interrupted movie choices
- Basic statistics page
- Supabase-backed catalog and history

## Backend
Supabase project: `Gaia - MovieSystem`
Project ref: `mahjewznwqvdgtdjtekc`

Direct platform URLs, Jellyfin item URLs, posters and voice recordings still need to be populated.
