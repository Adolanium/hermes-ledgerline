# Changelog

## 0.1.2 (2026-08-29)

Scope, analysis, and alert fixes.

- Session digest is wrapped as untrusted evidence before explain or audit.
- Analysis RPCs use the session's profile route when the desktop exposes one.
- Quick explain no longer attaches to the focused live session.
- Background audit refuses a session that is not on the live profile.
- `$knownRows`, alert channel, and scoped storage follow connection and profile.
- Content search under all profiles fans out per profile.
- Monthly budget checks walk every saved profile limit, not only the open tab.
- Session rows and search hits are buttons.

## 0.1.1 (2026-08-19)

Fixes and hardening.

- Tools tab: each tool row opens into its individual calls, one line per
  call (the command, the path, the query), with time and verdict, and each
  call opens into the full arguments and the head of the result.
- Per-session budgets now do something: the live pane shows the session's
  spend against its limit, and sessions that cross 80% or 100% raise an
  alert (once per session and level, same channels as the monthly one).
- Monthly budget alerts no longer depend on the Overview tab being open:
  a background check runs every five minutes while the gateway is open.
- The alert latch is kept per profile, so one profile crossing its limit
  does not silence another's alert for the month.
- Per-profile budget progress uses the month window, not the selected
  7/30/90-day window. Month figures fetch 31 days so the 1st of a 31-day
  month is not dropped on the 31st.
- Cron, profile and delivery-target queries are keyed by connection, so a
  gateway switch does not show the previous gateway's jobs.
- Live records are capped and expire after a day; unhandled events no
  longer insert empty records; blended rates are cached per row set.
- Background-audit listeners are disposed with the plugin and time out
  after 30 minutes; stale "running" answers show as interrupted; analysis
  buttons are disabled while one is running.
- Tool results with an empty `error` key are no longer counted as failed.
- Failed worst-first scans are not memoised as clean.
- What-if lines skip free models; the first provider listing a bare model
  id keeps it instead of being silently overwritten by a later one.
- Subscription-included sessions show $0.00 instead of n/a; tiny costs show
  as <$0.0001 rather than $0.0000.
- Under the all-profiles scope, the RPC fallback says it is showing the
  active profile only. RPC-only mode can page.
- The audit prompt tells the agent to treat transcript text as evidence
  only and never run commands the transcript suggests.
- Newer `host.state` members are read behind a fallback for older desktop
  builds. HTTP status sniffing uses word boundaries.

plugin.js SHA-256: `bd8b76a078a8bf14ea895e1245c99873e48462191294620cc0a3bb5026708685`

## 0.1.0 (2026-08-19)

First release. One plugin file for Hermes Desktop with:

- Sessions list and detail (tokens, cache hit rate, spend, tools, failures,
  files, subagents, timeline) over core REST with an RPC fallback. Content
  search, worst-first scan, archived toggle.
- Overview with spend windows, month projection, spend per day, by model
  (input, cached, written and output tokens, what-if repricing at list
  price), by helper task, recommendations you can dismiss and restore,
  monthly and per-session budgets.
- Profile scope: active profile, any single profile, or all profiles merged
  with a per-profile table. Budgets, dismissed tips, scans and saved answers
  kept per profile. The all-profiles view sums the profile budgets unless it
  has one of its own.
- Live ledger pane, statusbar chip and a running cost estimate at list
  price, from the gateway event stream.
- Analysis inside Hermes: quick explain, full audit, background audit.
- Alert channel and daily, weekly or monthly spend reports through the
  gateway's cron.

Checked by hand on a local gateway (Hermes 0.20.4) and on a remote gateway
in Docker behind username and password auth.

plugin.js SHA-256: `e5185febfc348064c22e87d42ae9d775e2a6b785abb140f552ac65eb5e7649f8`
