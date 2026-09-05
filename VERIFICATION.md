# Ledgerline 0.1.5 verification

Date: 5 September 2026

The five implementation issues in `Ledgerline-review-and-suggestions.md` were reproduced against 0.1.4. The initial regression suite had seven failing tests, covering those issues and the background watcher timeout leak.

## Changes

- Combined parent/subagent cost is unknown without an explicit accounting convention. Recorded amounts remain visible. The calculation functions support explicit inclusive and exclusive contracts, including nested children, for a future backend adapter.
- Tools without completion evidence become unknown or interrupted when a turn ends. Late completion evidence can replace that state.
- Session-list responses, transcript caches, paginated reads, scans, and saved audits respect connection/profile scope.
- Audit text and status persist from the event listener, including when the pane is closed. An audit reference is saved before prompt submission so an immediate answer is not lost. Stored-session recovery labels completion as unobserved.
- Uncertain cron creation failures do not retry through CLI. Missing endpoints and missing bridges retain the fallback.
- Background watcher cleanup releases its listener and timeout. Desktop builds without `ctx.onDispose` fail with an update instruction before registering background work.

## Automated checks

`node --test tests/regressions.cjs`: 19 passed, 0 failed.

`node --check plugin.js`: passed.

`git diff --check`: passed.

The regression suite runs the actual plugin with a simulated SDK. It covers delayed responses and event ordering without sending model prompts or creating scheduled jobs. These checks do not establish live remote-gateway compatibility.

## Computer Use

Hermes Desktop reported `v0.21.0 (+47) 1e69c12`. The original Ledgerline 0.1.4 overview rendered and showed session counts, spend, budgets, model breakdowns, and unknown-pricing recommendations.

The installed plugin at `C:/Users/Admin/AppData/Local/hermes/desktop-plugins/hermes-ledgerline/plugin.js` was backed up as `plugin.js.pre-0.1.5.bak` and replaced with 0.1.5.

Plugin reload initially left the already-mounted page displaying 0.1.4. After Hermes was reopened, Computer Use confirmed the heading identifies Ledgerline 0.1.5. Desktop then reported `v0.21.0 (+49) 1e69c12`.

Verified live:

- Overview renders spend, budgets, model breakdowns, and unknown-pricing recommendations.
- About reports backend `0.21.0 (2026.8.31)`, local/default scope, full RPC + REST mode, and a working REST bridge.
- Sessions lists 26 sessions. Selecting a session renders token/cache counts, duration, unknown-cost labeling, and transcript analysis showing nine tool calls across five tools and two file entries.
- The profile selector lists active/default, all profiles, and arke.

Computer Use repeatedly reported manual input and rejected profile-menu actions. Profile switching and answer persistence across a Desktop reload remain verified only by the regression suite, not by a completed live scenario. The gateway reports `cliExec` as missing. No model prompts, alert messages, or scheduled jobs were submitted during verification.

The document's provider tracing, recorder, and diagnostic export proposals remain future feature work.
