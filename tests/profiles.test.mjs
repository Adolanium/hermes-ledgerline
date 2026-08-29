import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPure } from './helpers/pure.mjs'

const pure = loadPure()

function bridgeRecorder(handler) {
  const calls = []
  return {
    calls,
    bridge: {
      api: async req => {
        calls.push(req)
        return handler(req)
      }
    }
  }
}

test('listSessions routes by scope: active default on primary, other active via bridge profile, named via query, all via unified route', async () => {
  const rec = bridgeRecorder(req => (req.path.startsWith('/api/profiles/sessions') ? { total: 1, sessions: [{ id: 'u1', profile: 'arke', started_at: 1 }] } : { total: 1, sessions: [{ id: 'x', started_at: 1 }] }))
  const d = pure.createDataLayer({ host: { request: async () => ({}) }, bridge: rec.bridge })

  await d.listSessions({ scope: { kind: 'active', profile: 'default' } })
  assert.equal(rec.calls[0].profile, undefined)
  assert.ok(rec.calls[0].path.startsWith('/api/sessions?'))
  assert.ok(!rec.calls[0].path.includes('profile='))

  await d.listSessions({ scope: { kind: 'active', profile: 'arke' } })
  assert.equal(rec.calls[1].profile, 'arke')
  assert.ok(!rec.calls[1].path.includes('profile='))

  const named = await d.listSessions({ scope: { kind: 'profile', profile: 'bots' } })
  assert.equal(rec.calls[2].profile, undefined)
  assert.ok(rec.calls[2].path.includes('&profile=bots'))
  assert.equal(named.rows[0].profile, 'bots', 'rows from a named scope carry that profile')

  const all = await d.listSessions({ scope: { kind: 'all' } })
  assert.ok(rec.calls[3].path.startsWith('/api/profiles/sessions?'))
  assert.ok(rec.calls[3].path.includes('profile=all'))
  assert.equal(all.rows[0].profile, 'arke', 'unified rows keep their own profile tag')
})

test('getMessages, getSession and searchSessions carry the scope the same way', async () => {
  const rec = bridgeRecorder(req => (req.path.includes('/messages') ? { messages: [] } : req.path.includes('/search') ? { results: [] } : { id: 's' }))
  const d = pure.createDataLayer({ host: {}, bridge: rec.bridge })
  await d.getMessages('s', { kind: 'profile', profile: 'bots' })
  assert.ok(rec.calls[0].path.includes('&profile=bots'))
  await d.getSession('s', { kind: 'active', profile: 'arke' })
  assert.equal(rec.calls[1].profile, 'arke')
  await d.searchSessions('q', 25, { kind: 'profile', profile: 'bots' })
  assert.ok(rec.calls[2].path.includes('&profile=bots'))
})

test('getAnalytics under all sums every profile and keeps a per-profile summary', async () => {
  const day = (spend, extra = {}) => ({ day: '2026-08-10', input_tokens: 100, output_tokens: 10, cache_read_tokens: 300, estimated_cost: spend, sessions: 1, api_calls: 1, ...extra })
  const raw = spend => ({
    period_days: 30,
    daily: [day(spend)],
    by_model: [{ model: 'm', input_tokens: 100, output_tokens: 10, estimated_cost: spend, sessions: 1, api_calls: 1 }],
    by_task: [{ task: 'compression', input_tokens: 5, output_tokens: 1, estimated_cost: 0.01, api_calls: 1, models: ['m'] }],
    totals: { total_input: 100, total_output: 10, total_cache_read: 300, total_estimated_cost: spend, total_sessions: 1, total_api_calls: 1 }
  })
  const rec = bridgeRecorder(req => {
    if (req.path.includes('profile=default')) return raw(1)
    if (req.path.includes('profile=arke')) return raw(2)
    throw new Error('HTTP 404')
  })
  const d = pure.createDataLayer({
    host: { request: async m => (m === 'profiles.list' ? { profiles: [{ name: 'default', is_default: true }, { name: 'arke' }, { name: 'broken' }] } : {}) },
    bridge: rec.bridge
  })
  const a = await d.getAnalytics(30, { kind: 'all' })
  assert.equal(a.totals.estimated, 3)
  assert.equal(a.totals.sessions, 2)
  assert.equal(a.daily.length, 1)
  assert.equal(a.daily[0].estimated, 3)
  assert.equal(a.byModel[0].estimated, 3)
  assert.equal(a.byTask[0].apiCalls, 2)
  assert.deepEqual(
    a.profiles.map(p => [p.profile, p.ok, p.spend]),
    [
      ['arke', true, 2],
      ['default', true, 1],
      ['broken', false, 0]
    ]
  )
  assert.ok(Math.abs(a.profiles[0].cacheHitRate - 300 / 400) < 1e-12)
})

test('mergeAnalytics with nothing readable is empty but well formed', () => {
  const m = pure.mergeAnalytics([{ profile: 'x', analytics: null }], 7)
  assert.equal(m.days, 7)
  assert.equal(m.totals.sessions, 0)
  assert.deepEqual(m.profiles.map(p => p.ok), [false])
})
