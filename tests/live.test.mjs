import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPure } from './helpers/pure.mjs'

const pure = loadPure()
const ev = (type, payload, session_id = 'r1') => ({ type, session_id, payload })

test('reduceLiveEvent builds a session record from a turn of events', () => {
  let s = null
  const t0 = 1000
  s = pure.reduceLiveEvent(s, ev('session.info', { stored_session_id: 'stored-1', model: 'm1', running: false, usage: { input: 10, output: 2, total: 12, calls: 1 } }), t0)
  assert.equal(s.storedId, 'stored-1')
  assert.equal(s.model, 'm1')
  assert.equal(s.busy, false)
  assert.equal(s.usage.total, 12)

  s = pure.reduceLiveEvent(s, ev('message.start', {}), t0 + 1)
  assert.equal(s.busy, true)

  s = pure.reduceLiveEvent(s, ev('tool.start', { tool_id: 't1', name: 'terminal', args: { command: 'ls' } }), t0 + 2)
  assert.equal(s.tools.length, 1)
  assert.equal(s.tools[0].endedAt, null)

  s = pure.reduceLiveEvent(s, ev('session.usage', { usage: { input: 50, output: 5, total: 55, calls: 2 } }), t0 + 3)
  assert.equal(s.usage.total, 55)

  s = pure.reduceLiveEvent(s, ev('tool.complete', { tool_id: 't1', name: 'terminal', args: { command: 'ls' }, duration_s: 0.4, result: { exit_code: 2, error: 'nope' } }), t0 + 4)
  assert.equal(s.tools[0].verdict, 'failed')
  assert.equal(s.tools[0].error, 'nope')
  assert.equal(s.tools[0].durationS, 0.4)
  assert.equal(s.tools[0].endedAt, t0 + 4)

  s = pure.reduceLiveEvent(s, ev('tool.start', { tool_id: 't2', name: 'read_file' }), t0 + 5)
  s = pure.reduceLiveEvent(s, ev('message.complete', { text: 'done', status: 'complete', usage: { input: 60, output: 9, total: 69, calls: 3 } }), t0 + 6)
  assert.equal(s.busy, false)
  assert.equal(s.usage.total, 69)
  assert.equal(s.lastComplete.status, 'complete')
  assert.equal(s.tools[1].endedAt, t0 + 6, 'an open tool is closed when the turn ends')
  assert.equal(s.tools[1].verdict, 'ok')
})

test('reduceLiveEvent never mutates the previous record and ignores unknown events', () => {
  const a = pure.reduceLiveEvent(null, ev('tool.start', { tool_id: 'x', name: 'n' }), 1)
  const b = pure.reduceLiveEvent(a, ev('tool.complete', { tool_id: 'x', name: 'n', result: 'ok' }), 2)
  assert.equal(a.tools[0].endedAt, null)
  assert.equal(b.tools[0].endedAt, 2)
  assert.equal(pure.reduceLiveEvent(a, ev('something.else', {}), 3), a)
  assert.equal(pure.reduceLiveEvent(a, null, 3), a)
})

test('reduceLiveEvent caps the tool timeline', () => {
  let s = null
  for (let i = 0; i < 250; i++) s = pure.reduceLiveEvent(s, ev('tool.start', { tool_id: `t${i}`, name: 'n' }), i)
  assert.equal(s.tools.length, 200)
  assert.equal(s.tools[0].toolId, 't50')
})

test('reduceLiveEvent tracks subagents across their events', () => {
  let s = null
  s = pure.reduceLiveEvent(s, ev('subagent.start', { subagent_id: 'sa1', goal: 'write tests', model: 'm-small', task_count: 2, task_index: 0 }), 1)
  s = pure.reduceLiveEvent(s, ev('subagent.start', { goal: 'write docs', task_count: 2, task_index: 1 }), 1)
  assert.equal(s.subagents.length, 2)
  s = pure.reduceLiveEvent(s, ev('subagent.tool', { subagent_id: 'sa1', tool_name: 'terminal', tool_count: 3 }), 2)
  assert.equal(s.subagents[0].currentTool, 'terminal')
  assert.equal(s.subagents[0].toolCount, 3)
  s = pure.reduceLiveEvent(s, ev('subagent.complete', { subagent_id: 'sa1', status: 'completed', summary: 'ok', duration_seconds: 12, input_tokens: 500, output_tokens: 40, api_calls: 3, files_written: ['/a.js'] }), 3)
  assert.equal(s.subagents[0].status, 'completed')
  assert.equal(s.subagents[0].currentTool, '')
  assert.equal(s.subagents[0].tokens.input, 500)
  assert.deepEqual(s.subagents[0].filesWritten, ['/a.js'])
  assert.equal(s.subagents[1].status, 'running')
  s = pure.reduceLiveEvent(s, ev('subagent.complete', { goal: 'write docs', task_index: 1, status: 'failed', summary: 'timed out' }), 4)
  assert.equal(s.subagents[1].status, 'failed')
})

test('blendedRates uses the last N costed sessions per model', () => {
  const mk = (id, model, cost, tokens, when) => ({
    id,
    model,
    hasUsage: true,
    lastActive: when,
    cost: { estimated: cost, actual: null, status: 'estimated' },
    tokens: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
  })
  const rows = [
    mk('a', 'm1', 1, 1000, 10),
    mk('b', 'm1', 3, 1000, 20),
    mk('c', 'm2', 0, 1000, 20),
    mk('d', 'm2', 0.5, 500, 5),
    ...Array.from({ length: 6 }, (_, i) => mk(`e${i}`, 'm1', 100, 1000, 100 + i))
  ]
  const r = pure.blendedRates(rows)
  assert.equal(r.m1.samples, 5, 'only the five most recent count')
  assert.equal(r.m1.usdPerToken, 0.1)
  assert.equal(r.m2.samples, 1, 'zero-cost rows are skipped')
  assert.equal(r.m2.usdPerToken, 0.001)
})

test('optionRates parses model.options pricing strings per million tokens', () => {
  const rates = pure.optionRates({
    providers: [
      { slug: 'openrouter', pricing: { 'anthropic/claude-sonnet-5': { input: '$3.00', output: '$15.00', cache: '$0.30', free: false }, 'x/free': { input: '$0', output: '$0', free: true } } },
      { slug: 'nous', pricing: null },
      { slug: 'other', pricing: { bad: { input: 'n/a', output: 'n/a' } } }
    ]
  })
  assert.equal(rates['anthropic/claude-sonnet-5'].input, 3 / 1_000_000)
  assert.equal(rates['anthropic/claude-sonnet-5'].output, 15 / 1_000_000)
  assert.equal(rates['anthropic/claude-sonnet-5'].cache, 0.3 / 1_000_000)
  assert.equal(rates['openrouter/anthropic/claude-sonnet-5'].input, 3 / 1_000_000)
  assert.equal(rates['x/free'].free, true)
  assert.equal(rates.bad, undefined)
  assert.deepEqual(pure.optionRates(null), {})
})

test('estimateUsd prefers list price (cached tokens at the cache rate), then the blended rate, then gives up', () => {
  const usage = { input: 1000, output: 100, total: 1100 }
  const blended = { m1: { usdPerToken: 0.00001, samples: 3 }, m2: { usdPerToken: 0.001, samples: 1 } }
  const options = { m2: { input: 0.000003, output: 0.000015, cache: 0.0000003 } }
  const a = pure.estimateUsd(usage, 'm1', blended, options)
  assert.ok(Math.abs(a.usd - 0.011) < 1e-9)
  assert.match(a.source, /last 3 sessions/)
  const b = pure.estimateUsd(usage, 'm2', blended, options)
  assert.ok(Math.abs(b.usd - (0.003 + 0.0015)) < 1e-9, 'list price wins over the blended rate')
  assert.match(b.source, /list price/)
  const c = pure.estimateUsd({ input: 1000, output: 100, total: 11_100 }, 'm2', blended, options)
  assert.ok(Math.abs(c.usd - (0.003 + 0.0015 + 10_000 * 0.0000003)) < 1e-9, 'tokens beyond input and output are cached, priced at the cache rate')
  const d = pure.estimateUsd({ input: 1000, output: 100, total: 11_100 }, 'm4', blended, { m4: { input: 0.000003, output: 0.000015, cache: null } })
  assert.ok(Math.abs(d.usd - (0.003 + 0.0015 + 10_000 * 0.000003)) < 1e-9, 'no cache price listed: cached tokens at the input rate')
  assert.equal(pure.estimateUsd(usage, 'm3', blended, options), null)
  assert.equal(pure.estimateUsd({ total: 0 }, 'm1', blended, options), null, 'nothing until the session has tokens')
  assert.equal(pure.estimateUsd(null, 'm1', blended, options), null)
})

test('subagent events without id or task_index reuse the entry with the same goal', () => {
  const ev = (type, payload) => ({ type, session_id: 'r1', payload })
  let s = pure.reduceLiveEvent(null, ev('subagent.start', { goal: 'write tests' }))
  s = pure.reduceLiveEvent(s, ev('subagent.progress', { goal: 'write tests', current_tool: 'terminal' }))
  s = pure.reduceLiveEvent(s, ev('subagent.complete', { goal: 'write tests', status: 'completed' }))
  assert.equal(s.subagents.length, 1)
  assert.equal(s.subagents[0].status, 'completed')
})
