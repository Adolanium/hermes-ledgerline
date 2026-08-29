import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPure } from './helpers/pure.mjs'

const pure = loadPure()

const restRow = {
  id: '20260819_010203_abc',
  title: 'Fix the build',
  preview: 'please fix',
  source: 'tui',
  model: 'anthropic/claude-sonnet-5',
  started_at: 1000,
  ended_at: null,
  last_active: 1600,
  message_count: 12,
  tool_call_count: 7,
  api_call_count: 5,
  input_tokens: 4000,
  output_tokens: 1000,
  cache_read_tokens: 6000,
  cache_write_tokens: 500,
  reasoning_tokens: 200,
  estimated_cost_usd: 0.0421,
  actual_cost_usd: null,
  cost_status: 'estimated',
  parent_session_id: null,
  is_active: 1,
  pinned: 0,
  archived: 0
}

test('normalizeRestSession maps every column and tolerates junk', () => {
  const s = pure.normalizeRestSession(restRow)
  assert.equal(s.id, restRow.id)
  assert.equal(s.tokens.cacheRead, 6000)
  assert.equal(s.cost.estimated, 0.0421)
  assert.equal(s.cost.actual, null)
  assert.equal(s.hasUsage, true)
  assert.equal(s.isActive, true)
  assert.equal(s.lastActive, 1600)

  const junk = pure.normalizeRestSession({ id: 5, input_tokens: 'nope', started_at: undefined })
  assert.equal(junk.id, '5')
  assert.equal(junk.tokens.input, 0)
  assert.equal(junk.startedAt, 0)
  assert.equal(pure.normalizeRestSession(null).id, '')
})

test('normalizeRpcSession has no usage and says so', () => {
  const s = pure.normalizeRpcSession({ id: 'x', title: 't', preview: 'p', started_at: 5, message_count: 2, source: 'cli' })
  assert.equal(s.hasUsage, false)
  assert.equal(pure.sessionCost(s), null)
  assert.equal(pure.cacheHitRate(s.tokens), null)
  assert.equal(s.lastActive, 5)
})

test('sessionCost prefers billed over estimated, cacheHitRate is reads over input, reads and writes', () => {
  const s = pure.normalizeRestSession(restRow)
  assert.equal(pure.sessionCost(s), 0.0421)
  assert.equal(pure.sessionCost({ cost: { actual: 0.5, estimated: 0.1 } }), 0.5)
  assert.equal(pure.cacheHitRate(s.tokens), 6000 / 10500)
  assert.equal(pure.tokenTotal(s.tokens), 11700)
})

test('sessionLabel falls back from title to preview to subagent to id', () => {
  assert.equal(pure.sessionLabel({ title: 'T', preview: 'P', id: 'abcdefghijklmnop' }), 'T')
  assert.equal(pure.sessionLabel({ title: '', preview: 'P', id: 'abcdefghijklmnop' }), 'P')
  assert.equal(pure.sessionLabel({ title: '', preview: '', parentId: 'p', id: 'abcdefghijklmnop' }), 'Subagent')
  assert.equal(pure.sessionLabel({ title: '', preview: '', parentId: null, id: 'abcdefghijklmnop' }), 'abcdefghijkl')
})

test('durationSeconds uses ended_at, then last activity, never negative', () => {
  assert.equal(pure.durationSeconds({ startedAt: 100, endedAt: 160, lastActive: 900 }), 60)
  assert.equal(pure.durationSeconds({ startedAt: 100, endedAt: null, lastActive: 130 }), 30)
  assert.equal(pure.durationSeconds({ startedAt: 100, endedAt: 50, lastActive: 0 }), 0)
})

test('filterSessions matches title, id and preview, and honours source and hasCost', () => {
  const rows = [
    pure.normalizeRestSession(restRow),
    pure.normalizeRestSession({ ...restRow, id: 'other', title: 'Nothing', preview: 'zzz', source: 'telegram', estimated_cost_usd: null })
  ]
  assert.equal(pure.filterSessions(rows, { query: 'BUILD' }).length, 1)
  assert.equal(pure.filterSessions(rows, { query: 'other' }).length, 1)
  assert.equal(pure.filterSessions(rows, { query: 'zzz' }).length, 1)
  assert.equal(pure.filterSessions(rows, { source: 'telegram' }).length, 1)
  assert.equal(pure.filterSessions(rows, { hasCost: true }).length, 1)
  assert.equal(pure.filterSessions(rows, {}).length, 2)
})

test('sortSessions orders by cost, tokens, tools, and recent with a stable tiebreak', () => {
  const a = pure.normalizeRestSession({ ...restRow, id: 'a', estimated_cost_usd: 0.1, last_active: 10, tool_call_count: 1, input_tokens: 10 })
  const b = pure.normalizeRestSession({ ...restRow, id: 'b', estimated_cost_usd: 0.3, last_active: 5, tool_call_count: 9, input_tokens: 5 })
  const c = pure.normalizeRestSession({ ...restRow, id: 'c', estimated_cost_usd: 0.3, last_active: 7, tool_call_count: 2, input_tokens: 99 })
  const ids = rows => rows.map(r => r.id)
  assert.deepEqual(ids(pure.sortSessions([a, b, c], 'costliest')), ['c', 'b', 'a'])
  assert.deepEqual(ids(pure.sortSessions([a, b, c], 'tokens')), ['c', 'a', 'b'])
  assert.deepEqual(ids(pure.sortSessions([a, b, c], 'tools')), ['b', 'c', 'a'])
  assert.deepEqual(ids(pure.sortSessions([a, b, c], 'recent')), ['a', 'c', 'b'])
  assert.deepEqual(ids([a, b, c]), ['a', 'b', 'c'], 'input is not mutated')
})

test('distinct collects sorted unique values and skips blanks', () => {
  assert.deepEqual(pure.distinct([{ s: 'b' }, { s: 'a' }, { s: '' }, { s: 'b' }], 's'), ['a', 'b'])
})

test('formatters', () => {
  assert.equal(pure.fmtUsd(null), 'n/a')
  assert.equal(pure.fmtUsd(0), '$0.00')
  assert.equal(pure.fmtUsd(0.0042), '$0.0042')
  assert.equal(pure.fmtUsd(0.42), '$0.420')
  assert.equal(pure.fmtUsd(12.345), '$12.35')
  assert.equal(pure.fmtCount(999), '999')
  assert.equal(pure.fmtCount(1234), '1.2k')
  assert.equal(pure.fmtCount(123456), '123k')
  assert.equal(pure.fmtCount(2_500_000), '2.5M')
  assert.equal(pure.fmtPct(null), 'n/a')
  assert.equal(pure.fmtPct(0.666), '67%')
  assert.equal(pure.fmtDuration(59), '59s')
  assert.equal(pure.fmtDuration(600), '10m')
  assert.equal(pure.fmtDuration(5400), '1.5h')
  const now = 1_000_000
  assert.equal(pure.fmtWhen(now - 30, now), 'just now')
  assert.equal(pure.fmtWhen(now - 120, now), '2m ago')
  assert.equal(pure.fmtWhen(now - 7200, now), '2h ago')
  assert.equal(pure.fmtWhen(now - 3 * 86400, now), '3d ago')
  assert.match(pure.fmtWhen(now - 30 * 86400, now), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(pure.fmtWhen(0, now), '')
})

test('listSessions uses core REST pages and falls back to session.list on a rest error', async () => {
  const seen = []
  const restData = pure.createDataLayer({
    host: { request: async () => ({ sessions: [] }) },
    bridge: {
      api: async req => {
        seen.push(req.path)
        const offset = Number(new URL('http://x' + req.path).searchParams.get('offset'))
        return { total: 250, sessions: [{ ...restRow, id: `s${offset}` }] }
      }
    }
  })
  const rest = await restData.listSessions({ pages: 2 })
  assert.equal(rest.source, 'rest')
  assert.equal(rest.total, 250)
  assert.deepEqual(
    rest.rows.map(r => r.id),
    ['s0', 's100']
  )
  assert.ok(seen[0].includes('limit=100&offset=0'))
  assert.ok(seen[1].includes('offset=100'))

  const rpcData = pure.createDataLayer({
    host: {
      request: async m => (m === 'session.list' ? { sessions: [{ id: 'r1', title: 'via rpc', started_at: 1, message_count: 1, source: 'cli' }] } : {})
    },
    bridge: undefined
  })
  const viaRpc = await rpcData.listSessions({ pages: 1 })
  assert.equal(viaRpc.source, 'rpc')
  assert.equal(viaRpc.rows[0].hasUsage, false)
  assert.equal(viaRpc.rows[0].title, 'via rpc')
})

test('rowsCacheRate counts writes, respects the window and the profile filter', () => {
  const now = 2_000_000 * 1000
  const row = (startedAt, profile, input, cacheRead, cacheWrite) => ({ hasUsage: true, startedAt, profile, tokens: { input, cacheRead, cacheWrite } })
  const rows = [
    row(2_000_000 - 100, 'a', 100, 800, 100),
    row(2_000_000 - 100, 'b', 900, 100, 0),
    row(2_000_000 - 40 * 86400, 'a', 0, 1_000_000, 0),
    { hasUsage: false, startedAt: 2_000_000, tokens: { input: 0, cacheRead: 0, cacheWrite: 0 } }
  ]
  assert.equal(pure.rowsCacheRate(rows, 30, now), 900 / 2000)
  assert.equal(pure.rowsCacheRate(rows, 30, now, 'a'), 0.8)
  assert.equal(pure.rowsCacheRate(rows, 30, now, 'b'), 0.1)
  assert.equal(pure.rowsCacheRate([], 30, now), null)
})

test('sessionCost is $0 for included routes, null when unknown, and fmtUsd never shows a tiny cost as zero', () => {
  assert.equal(pure.sessionCost({ cost: { actual: null, estimated: 0, status: 'included' } }), 0)
  assert.equal(pure.sessionCost({ cost: { actual: null, estimated: 0, status: 'unknown' } }), null)
  assert.equal(pure.sessionCost({ cost: { actual: 0, estimated: 0.1, status: 'estimated' } }), 0)
  assert.equal(pure.sessionCost({ cost: { actual: 0, estimated: 0, status: 'included' } }), 0)
  assert.equal(pure.fmtUsd(0.00003), '<$0.0001')
  assert.equal(pure.fmtUsd(0), '$0.00')
})

test('mergeKnownRows replaces the bag on a scope change and unions on the same scope', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  const switched = pure.mergeKnownRows([a, b], 'local:old', [c], 'local:new', 1000)
  assert.deepEqual(switched.rows.map(r => r.id), ['c'])
  assert.equal(switched.scope, 'local:new')
  const same = pure.mergeKnownRows([a, b], 'local:p', [c, a], 'local:p', 1000)
  assert.deepEqual(same.rows.map(r => r.id), ['c', 'a', 'b'])
  const capped = pure.mergeKnownRows([a, b], 'k', [c], 'k', 2)
  assert.equal(capped.rows.length, 2)
  assert.deepEqual(capped.rows.map(r => r.id), ['c', 'a'])
})

test('pickRoute requires one match for that profile and connection', () => {
  const routes = [
    { profile: 'a', connectionId: 'local', targetProfile: 'a' },
    { profile: 'b', connectionId: 'local', targetProfile: 'b' },
    { profile: 'a', connectionId: 'remote', targetProfile: 'a' }
  ]
  assert.equal(pure.pickRoute(routes, { profile: 'a', connectionId: 'local' }).targetProfile, 'a')
  assert.equal(pure.pickRoute(routes, { profile: 'a', connectionId: 'remote' }).connectionId, 'remote')
  assert.equal(pure.pickRoute(routes, { profile: 'missing', connectionId: 'local' }), null)
  assert.equal(pure.pickRoute([...routes, { profile: 'a', connectionId: 'local' }], { profile: 'a', connectionId: 'local' }), null)
  assert.equal(pure.routeStillHeld(routes, { profile: 'b', connectionId: 'local' }), true)
  assert.equal(pure.routeStillHeld(routes, { profile: 'b', connectionId: 'gone' }), false)
})
