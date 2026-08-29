<div align="center">

  <a href="https://github.com/NousResearch/hermes-agent">
    <img src="https://github.com/user-attachments/assets/ac2f5702-c842-4b2e-9340-737481fa0ece" width="96" height="96" alt="Nous Research Hermes mark" />
  </a>

  # Ledgerline

  **Every session has a cost. Most of them hide it.**

  Ledgerline shows what every Hermes session costs, why, and what to change.
  One plugin file for Hermes Desktop. No backend, no restart. The same file
  works on a local gateway and on a remote one.

  <sub>POWERED BY <a href="https://github.com/NousResearch/hermes-agent">HERMES AGENT</a> &nbsp;·&nbsp; COMMUNITY PLUGIN &nbsp;·&nbsp; VERSION 0.1.2</sub>

  <br /><br />

  [See the numbers](#the-bill-in-the-room) &nbsp;·&nbsp; [Install it](#make-it-yours) &nbsp;·&nbsp; [Understand the data](#privacy-you-can-explain-in-one-breath)

</div>

<img width="1002" height="958" alt="ledgerline" src="https://github.com/user-attachments/assets/6f0911eb-f684-4e25-82d5-9cc832f855fa" />

## Powered by Hermes

Ledgerline is a community-built cost surface for [Hermes Desktop](https://github.com/NousResearch/hermes-agent). It uses the Hermes plugin SDK, the gateway's own session and analytics routes, your configured model, and the same profile-aware desktop you already use.

The ledger gives Hermes a place to show the bill. A session becomes a spend line, a cache-hit rate, or an audit without leaving the app.


## The bill in the room

Most cost views stop at a total. Ledgerline gives each number a next step without turning every session into an AI task.

| | |
| --- | --- |
| **See**<br />Spend today, this week, this month, and where the month is heading. Per day, per model, and per helper task (compression, memory review, title generation). | **Split**<br />Each model row breaks tokens into input, cache reads, cache writes, and output. On a cached provider, that split is the bill. |
| **Watch**<br />A ledger pane and a statusbar chip follow the live turn: tokens, calls, context fill, tools, subagents, and a running cost at list price. | **Explain**<br />Pick a session and ask. A quick explain is one small model call. A full audit opens a session. A background audit runs headless. |

The pane stays quiet until you ask it to do more. AI actions are explicit and use your configured Hermes providers.

## Less guessing. More of the bill.

Ledgerline handles the small decisions that make a cost view worth opening again:

- Monthly and per-session budgets warn you at 80% and 100%.
- Recommendations name the dollar figure: low cache hit rates, unknown pricing, helper tasks eating a big share, a cheaper model for the same tokens.
- Title and full-text search over sessions. Sort by recent, cost, tokens, tools, or worst (failed tool calls).
- Active profile, any single profile, or all of them merged. Budgets, dismissed tips, scans, and saved answers stay per profile.
- Budget alerts go out through any messaging platform the gateway already has.
- Daily, weekly, or monthly spend reports run as cron jobs on the gateway.

The quiet costs show up next to the chat.

## Built for real gateways, not a demo list

Ledgerline is a single desktop plugin. It reads the same sessions `hermes insights` and your provider invoice already use, and it works with stock Hermes Desktop. There is no fork, upstream patch, separate backend, build step, or package manager.

Every dollar is what the gateway recorded, at the prices it recorded it with. Ledgerline does not reprice history. A session Hermes priced wrong, or could not price (a local model, a provider with no snapshot), shows up that way here too. Unknown pricing is flagged in the recommendations, not fixed.

## Make it yours

### Install

Copy [`plugin.js`](plugin.js) to Hermes' desktop plugin directory:

```text
~/.hermes/desktop-plugins/ledgerline/plugin.js
```

On native Windows:

```text
%LOCALAPPDATA%\hermes\desktop-plugins\ledgerline\plugin.js
```

The folder name must match the plugin id (`ledgerline`). Open Hermes and choose **Ledgerline** in the sidebar, or use **Cmd+K** (**Ctrl+K** on Windows) → **Ledgerline: Open**. The shortcut is Ctrl/Cmd+Alt+L.

If the sidebar item is missing, run **Reload desktop plugins**. Restart Hermes after replacing the file if an already-open page keeps the old plugin loaded.

The same `plugin.js` file is both the source and the installable artifact.

## AI, when you ask

Quick explain, full audit, and background audit use your configured Hermes model. The digest you see in the pane is exactly what gets sent. Tool arguments stay out unless you tick that box.

A full audit opens a native Hermes session with the digest as context and streams the answer back. A background audit runs headless and saves the result. Source text from the transcript is treated as evidence only. The agent is told not to run commands the transcript suggests.

Model calls apply their normal usage costs. Scheduled reports are one agent turn each, on the default model.

## Privacy you can explain in one breath

```text
Your Hermes Desktop  →  the connected gateway  →  your configured AI or messaging target (only when asked)
```

Budgets, dismissed tips, scans, and saved answers live in Hermes plugin storage on this desktop, keyed by connection and profile. Session history stays in the gateway's own store. This plugin does not sync that data elsewhere.

- **Recorded prices.** Spend figures come from the gateway, not from a second price list.
- **Bounded AI context.** Explains and audits receive the selected session digest only when you start that action.
- **Alerts you pick.** Nothing is sent to a messaging channel until you choose one. Test sends are explicit.
- **Clean removal.** Removing the plugin file drops the page, chip, and pane. Gateway sessions, cron jobs, and plugin storage keys are not wiped.

## Compatibility

Ledgerline uses the desktop plugin SDK, `host.request` JSON-RPC, and the gateway's core REST routes through the desktop's own bridge. That is the same door the app uses for its session list, so it works on local, token, and OAuth remotes.

Reports and alert pushes run `hermes cron` and `hermes send` on the gateway host. If the REST door is missing, the plugin drops to an RPC-only mode and says so on the About tab.

List prices for what-ifs and the live estimate come from the gateway's model catalog, fetched on load, again on every reconnect, and hourly.

It is checked by hand on a local gateway (Hermes 0.20.4) and on a remote gateway behind username and password auth.

## Limits

- Session list pages are 100 rows. The in-memory row cache caps at 1,000.
- Message reads stop after 6 pages of 500 (3,000 messages). Longer sessions are marked truncated.
- Live records cap at 200 and expire after a day. Live events exist only for sessions this desktop drives.
- Saved analysis answers cap at 50 per profile scope.
- Cache writes per model come from the session list and show as a floor when child sessions are missing from it.
- What-if lines skip free models and need at least $0.05 of recorded spend on the row.

Ledgerline works around a few upstream gaps today. If Hermes adds the fields, the plugin will feature-detect them.

- `session.usage` over JSON-RPC returns tokens but no cache tokens and no cost.
- The gateway relay drops `cost_usd` from `subagent.complete` events.
- `cron.manage` `add` cannot set a delivery target over RPC.
- `/api/analytics/usage` has no cache write column and no per-model cache reads.

<br />

<div align="center">
  <strong>Ledgerline</strong><br />
  <sub>Know the bill before the month does.</sub>
</div>

<br />

> **Community project**
>
> Ledgerline is an independent community plugin. It is not affiliated with, endorsed by, sponsored by, or officially associated with [Nous Research](https://github.com/NousResearch) or the [Hermes Agent project](https://github.com/NousResearch/hermes-agent). Hermes, Hermes Agent, and Nous Research are names and marks belonging to their respective owners.
