import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPure } from './helpers/pure.mjs'

const pure = loadPure()

test('parseSendTargets reads hermes send --list --json in its known shapes', () => {
  assert.deepEqual(pure.parseSendTargets('{"platforms": {}}'), [])
  assert.deepEqual(pure.parseSendTargets('not json'), [])
  const out = pure.parseSendTargets(
    JSON.stringify({
      platforms: {
        telegram: [{ id: '123', name: 'Ops chat' }, 'raw-id'],
        discord: [],
        slack: { general: { id: 'C1', name: 'general' } }
      }
    })
  )
  assert.deepEqual(out, [
    { platform: 'telegram', target: 'telegram:123', label: 'telegram: Ops chat' },
    { platform: 'telegram', target: 'telegram:raw-id', label: 'telegram:raw-id' },
    { platform: 'discord', target: 'discord', label: 'discord (home channel)' },
    { platform: 'slack', target: 'slack:C1', label: 'slack: general' }
  ])
})

test('normalizeCronJob flags our jobs and tolerates both tool and REST shapes', () => {
  const tool = pure.normalizeCronJob({ job_id: 'j1', name: 'ledgerline-weekly', schedule: 'every monday 09:00', deliver: 'telegram', enabled: false, state: 'paused', last_status: 'ok', prompt_preview: 'Write…' })
  assert.equal(tool.id, 'j1')
  assert.equal(tool.ours, true)
  assert.equal(tool.enabled, false)
  assert.equal(tool.deliver, 'telegram')
  const rest = pure.normalizeCronJob({ id: 'j2', name: 'other', schedule: { expr: '0 9 * * *' }, prompt: 'p' })
  assert.equal(rest.id, 'j2')
  assert.equal(rest.ours, false)
  assert.equal(rest.schedule, '0 9 * * *')
  assert.equal(rest.deliver, 'local')
  assert.equal(pure.normalizeCronJob(null).id, '')
})

test('reportPrompt names the window and stays plain text', () => {
  const p = pure.reportPrompt(7)
  assert.ok(p.includes('hermes insights --days 7'))
  assert.ok(p.includes('exactly one terminal command'))
  assert.doesNotMatch(p, /[—–]/)
})

test('createCronJob goes through REST with deliver and falls back to the CLI', async () => {
  const restCalls = []
  const viaRest = pure.createDataLayer({
    host: { request: async () => ({}) },
    bridge: {
      api: async req => {
        restCalls.push(req)
        return { job: { id: 'new', name: req.body.name, schedule: req.body.schedule, deliver: req.body.deliver } }
      }
    }
  })
  const made = await viaRest.createCronJob({ name: 'ledgerline-weekly', schedule: '0 9 * * 1', prompt: 'p', deliver: 'telegram' })
  assert.equal(made.id, 'new')
  assert.equal(made.deliver, 'telegram')
  assert.equal(restCalls[0].method, 'POST')
  assert.equal(restCalls[0].path, '/api/cron/jobs')

  const cliCalls = []
  const viaCli = pure.createDataLayer({
    host: {
      request: async (m, params) => {
        cliCalls.push(params.argv)
        return { blocked: false, code: 0, output: 'ok' }
      }
    },
    bridge: undefined
  })
  const made2 = await viaCli.createCronJob({ name: 'ledgerline-daily', schedule: '0 9 * * *', prompt: 'p', deliver: 'discord' })
  assert.equal(made2.created, true)
  assert.deepEqual(cliCalls[0], ['cron', 'create', '0 9 * * *', 'p', '--name', 'ledgerline-daily', '--deliver', 'discord'])
})

test('listDeliveryTargets falls back to the send list when REST is missing', async () => {
  const d = pure.createDataLayer({
    host: { request: async () => ({ blocked: false, code: 0, output: JSON.stringify({ platforms: { telegram: [{ id: '1', name: 'x' }] } }) }) },
    bridge: undefined
  })
  const targets = await d.listDeliveryTargets()
  assert.deepEqual(
    targets.map(t => t.id),
    ['local', 'telegram']
  )
})

test('sendMessage surfaces a non-zero exit as a typed error', async () => {
  const d = pure.createDataLayer({ host: { request: async () => ({ blocked: false, code: 1, output: 'no such platform' }) }, bridge: undefined })
  await assert.rejects(d.sendMessage('telegram', 'hi'), err => err.kind === 'cli' && err.code === 'exit-1')
})
