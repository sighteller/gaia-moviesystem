# Ranking statistics

The stats action returns aggregate rows only; raw imported history, devices and recommendation models remain private.

## Algorithm
All active root titles with at least one active supported platform, independently of UI category/platform filters. Scores are recalculated as at the start of a new session (current session is excluded from the model context). Model rules are unchanged. Discovery scheduling can change proposal order.

The SQL snapshot scorer mirrors scoreTitle in recommendations.js. Validated component by component against all 363 eligible real catalog titles at a fixed timestamp: maximum difference under 5e-14. Any future model rule change must update the SQL scorer, increment snapshot model_version, and repeat parity tests.

## Favorites
At most 30 per period: current Rome calendar day plus preceding 6/29 days, or all available history. All new Gaia selections count, including repeats; no rejection penalties. Existing imported eligibility/matching rules are reused: imported history counts distinct eligible title-days, not individual play events. A day with Gaia selections is not also counted as an imported day. The UI displays the two contributions explicitly. Test/verification subjects registered in recommendation_devices are excluded. Archived titles are excluded. Existing history is preserved.

## Snapshots
Private RLS-enabled gaia_private.ranking_snapshots stores epoch, Rome day, capture timestamp, model version and ranked JSON rows including components. No anonymous table or RPC access. The existing stats edge action supplies aggregate data through a service-only RPC.

The cron job runs hourly at minute 5 and captures only when local Rome hour is 0, handling DST without changing UTC schedules. Daily acquisition is idempotent. Initial acquisition/on-read fallback prevents an empty baseline after deployment. Comparison requires yesterday's snapshot from the same epoch/version; no fabricated backfill. The first day shows no change arrow.

Version 1 was an initial pre-publication validation snapshot. It is preserved for audit. Version 2 corrects null-input parity and is the only version used by the page.

## Checks performed
- All live scores and components compared with the original JS scorer.
- Stats endpoint: 363 algorithm rows; favorites 2/3/30 at validation time.
- Arrow helper: gains, losses, missing baseline and new entries.
- Private permissions and cron configuration inspected.
- No viewing/selection history was changed by this implementation.
