# Catalog identification

Each title has an explicit TMDb search dialog. It starts from the unsaved title draft, supports changing the query and paging, and shows title/year/type/overview. Selecting a result fetches authoritative metadata and at most four covers through the existing image-curator candidates action. Matching works even when no poster passes curation.

"Usa questo risultato" updates only the draft. Cover selection is optional; existing effective cover remains by default. "Identificato manualmente" marks an unmatched item complete without inventing a TMDb ID. Such items leave the unidentified filter after saving.

The one catalog Save button commits all drafts in one transaction. Ordinary saves retain the existing anonymous path. Identifications use a service-only wrapper of the same validated save RPC. The wrapper reads cached metadata server-side, rejects expired/wrong/duplicate matches, preserves Jellyfin IDs, quote, history and platform links, and prevents turning an episode into a series or a series with children into a movie.

No new anonymous metadata-edit grants. Internal cache has RLS and no anonymous read access. Association cache expires after seven days; the user must repeat an expired lookup. Nothing is saved merely by opening/searching/closing the dialog except the provider cache.

Validation: real TMDb lookup for Big Fish & Begonia (2016); service-role transaction test of manual/automatic association, cover/Jellyfin/quote preservation and stale revision rejection, rolled back without changing the user's catalog. Frontend syntax and live dialog checked. Existing catalog drafts are never reloaded by the dialog.
