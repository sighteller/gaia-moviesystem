# Catalog episode structure
The catalog now distinguishes Film, Serie TV and Episodio. Episodes reference an existing root series. Season (0 for specials) and episode numbers are optional; DVD/collection name is stored separately. Unnumbered episodes appear under "Episodi da identificare" inside the parent series.

Episode is an editor concept backed by media_type=movie plus series_id, preserving compatibility with the existing model. Explicit parent IDs drive grouping; episode IDs, viewing history, covers, quotes and platform links remain unchanged.

Edits remain drafts until the shared Save button. Draft grouping stays in its original location until persistence so a title cannot disappear unexpectedly from the current filter while being edited. New series drafts are processed before episode attachments in one transaction.

Structural saves use the existing endpoint and a service-only validated RPC; no additional anonymous column-update grants. Cycles/self-parenting, invalid parents, number ranges, and converting a series with children are rejected. An existing TMDb movie/series association cannot silently switch type. TMDb multi-search is disabled for episodes because it searches movie/series records, not individual TV episodes.

Tests: draft helper movie/series/episode transitions; real four Backstage Pass titles attached to I Simpson inside a transaction rolled back at the end; optional numbering, cover/source/quote preservation and invalid self-parent rejection. No actual catalog entries were regrouped by the tests.
