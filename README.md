<div align="center">

  <a href="https://github.com/NousResearch/hermes-agent">
    <img src="https://github.com/user-attachments/assets/ac2f5702-c842-4b2e-9340-737481fa0ece" width="96" height="96" alt="Nous Research Hermes mark" />
  </a>

  # Ledgerline

  **Every session has a cost. Most of them hide it.**

  Ledgerline shows what every Hermes session costs, why, and what to change.
  One plugin file for Hermes Desktop. No backend, no restart. The same file
  works on a local gateway and on a remote one.

  <sub>POWERED BY <a href="https://github.com/NousResearch/hermes-agent">HERMES AGENT</a> &nbsp;·&nbsp; COMMUNITY PLUGIN &nbsp;·&nbsp; VERSION 0.1.6</sub>

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
| **Watch**<br />A ledger pane and a statusbar chip follow the live turn: tokens, calls, context fill, tools, subagents, and a running cost at list price. Child spend is estimated while they run. | **Explain**<br />Pick a session and ask. A quick explain is one small model call. A full audit opens a session. A background audit runs headless. |

The pane stays quiet until you ask it to do more. AI actions are explicit and use your configured Hermes providers.

## Less guessing. More of the bill.

Ledgerline handles the small decisions that make a cost view worth opening again:

- Monthly and per-session budgets warn you at 80% and 100%.
- Recommendations name the dollar figure: low cache hit rates, unknown pricing, helper tasks eating a big share, a cheaper model for the same tokens.
- Parent and subagent costs appear as separate recorded rows in a receipt. Combined cost is unknown when the gateway does not specify whether parent costs include children. Costliest sort falls back to recorded session cost. Child rows and file paths are clickable when the desktop can open them.
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

Audit text and completion status persist while streaming, under the connection and profile that started the audit. Reopening an unfinished audit can recover its answer from the stored Hermes session. Recovery labels completion as unobserved and flags partial transcripts.

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

Version 0.1.6 requires `ctx.onDispose` so plugin reloads can release event listeners and timers. Builds without it report an update requirement before registering background work. The REST bridge is an internal Desktop dependency, not a public SDK guarantee.

An uncertain scheduled-report creation response does not trigger a second write. Refresh the scheduled jobs list before retrying. CLI fallback is limited to a missing bridge or a missing REST endpoint.

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
- Combined costs require an explicit accounting contract, which current gateway rows do not provide. Transcript-only children show up after you open the parent. Monthly analytics remain the gateway's recorded totals; Ledgerline cannot certify their treatment of child costs.
- Clicking a file path reveals it in the OS file manager when that door exists, otherwise the path is copied.

Ledgerline works around a few upstream gaps today. If Hermes adds the fields, the plugin will feature-detect them.

## Regression checks

Run `node --test tests/regressions.cjs` with Node.js. The suite executes the actual plugin with a simulated SDK and covers accounting, interrupted tools, delayed scope changes, audit persistence and recovery, cron retry behavior, and listener/timer cleanup. It does not send prompts or create gateway jobs.

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


## Signed updates and recovery

At the bottom of Ledgerline, choose **Check for updates**. The plugin checks [its own GitHub releases](https://github.com/Adolanium/hermes-ledgerline/releases) and asks before installing. **Update now** downloads the offered version; **Later** leaves the installation unchanged. Checking alone downloads only release metadata.

Every update has an ECDSA P-256 signature verified against the public key embedded in the plugin. The signed metadata binds the repository, plugin identity, version, exact commit, file list, sizes, and SHA-256 hashes. Unsigned releases, changed downloads, and automatic downgrades are rejected. A signature verifies origin and integrity, not the absence of bugs.

The updater replaces only `plugin.js`. It requires no additional Python, Git, package manager, or updater service. All file operations use stock Desktop APIs on the **local Desktop profile**, even when the gateway is remote. Saved settings are preserved. Both `hermes-ledgerline` and `ledgerline` install folders are recognized. Keep only one copy installed.

**Restore previous version** verifies the last complete backup and asks before restoring. Choose **Restore now** or **Cancel**. Updating or restoring reloads the plugin, so finish active work first. Terminal connections may close. Use **Reload desktop plugins** or restart Desktop if the screen does not refresh.

Backups remain beside the installed files as `update-<id>-backup-<filename>`. Failed replacements attempt to restore every original file. Desktop does not expose an atomic multi-file replacement: a crash between renames can require manual recovery. Close Desktop, move any replaced files aside, restore **all files from the same backup ID** to their original names, then reopen Desktop. For example, `update-<id>-backup-plugin.js` becomes `plugin.js`.

Existing installations need one manual installation of this updater-enabled version. Later versions can use the confirmation flow above. Hermes Agent source changes are not required.

### Publishing updates

The release description must contain a signed `hermes-desktop-update` block using schema 2. Publish a stable tag `v<VERSION>` against the exact pushed commit named in the signature. This plugin accepts only `Adolanium/hermes-ledgerline`, plugin ID `ledgerline`, and `plugin.js`. Signing is a maintainer operation; the private signing key must stay outside the repository and never ship to users.

<details>
<summary>Maintainer signing procedure</summary>

Update VERSION, test, commit, and push. Save this script outside the repository as sign-release.mjs and run node /path/to/sign-release.mjs FULL_COMMIT_SHA from the repository. It prints the path of the signed release notes. Publish with gh release create vVERSION --target FULL_COMMIT_SHA --notes-file NOTES_PATH. Keep the signed block unchanged when adding notes. Only maintainers need Node.js and Git.

The private key is read from HERMES_PLUGIN_SIGNING_KEY, or the maintainer's ~/.hermes-ssh-release/signing-key.pem. This is the existing family signing identity; signatures also bind each release to its own repository. Back up the key securely. Key rotation needs a release signed by the previous key or a manual reinstall.

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const commit = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('Use a full pushed commit SHA.');
const source = execFileSync('git', ['show', `${commit}:plugin.js`]).toString('utf8');
const plugin = source.match(/const PLUGIN_ID\s*=\s*['"]([^'"]+)['"]/)?.[1];
const version = source.match(/const VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const repo = source.match(/repo: "(Adolanium\/[^"]+)"/)?.[1];
const names = JSON.parse(source.match(/files: (\[[^\]]+\])/)[1]);
const pinned = source.match(/const UPDATE_KEY = "([^"]+)"/)?.[1];
if (!plugin || !/^\d+\.\d+\.\d+$/.test(version) || !repo ||
    names.some(name => !['plugin.js', 'probe.py'].includes(name))) throw Error('Invalid updater configuration.');
const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim().replace(/\.git$/, '');
if (origin !== `https://github.com/${repo}` && origin !== `git@github.com:${repo}`) throw Error('Repository does not match origin.');
const key = fs.readFileSync(process.env.HERMES_PLUGIN_SIGNING_KEY || path.join(os.homedir(), '.hermes-ssh-release', 'signing-key.pem'));
if (crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64') !== pinned) throw Error('Signing key does not match the plugin.');
const files = names.map(name => {
  const content = execFileSync('git', ['show', `${commit}:${name}`]);
  if (!content.length || content.length > 500000) throw Error('Release file exceeds updater limits.');
  return { name, sha256: crypto.createHash('sha256').update(content).digest('hex'), bytes: content.length };
});
const payload = Buffer.from(JSON.stringify({ schema: 2, plugin, repo, version, commit, files }));
const signature = crypto.sign('sha256', payload, { key, dsaEncoding: 'ieee-p1363' });
const envelope = { payload: payload.toString('base64'), signature: signature.toString('base64') };
const output = path.join(os.tmpdir(), repo.split('/')[1] + '-release-notes.md');
fs.writeFileSync(output, `${repo.split('/')[1]} v${version}\n\nSigned updates and backup recovery, with confirmation before each change.\n\n\`\`\`hermes-desktop-update\n${JSON.stringify(envelope)}\n\`\`\`\n`);
console.log(output);

```

</details>
