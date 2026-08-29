import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPure } from './helpers/pure.mjs'

const pure = loadPure()

// 2026-08-19T12:00:00Z
const NOW = Date.UTC(2026, 7, 19, 12)
const day = (offset, spend, extra = {}) => {
  const d = new Date(NOW - offset * 86400000)
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return { day: key, input_tokens: 1000, output_tokens: 100, cache_read_tokens: 3000, reasoning_tokens: 0, estimated_cost: spend, actual_cost: 0, sessions: 1, api_calls: 2, ...extra }
}

const raw = {
  period_days: 30,
  daily: [day(0, 1), day(1, 2), day(2, 3), day(6, 4), day(7, 10), day(20, 5)],
  by_model: [
    { model: 'big', input_tokens: 1_000_000, output_tokens: 100_000, estimated_cost: 20, sessions: 3, api_calls: 9 },
    { model: 'small', input_tokens: 500, output_tokens: 50, estimated_cost: 0.01, sessions: 1, api_calls: 1 }
  ],
  by_task: [{ task: 'compression', input_tokens: 5000, output_tokens: 500, estimated_cost: 3, api_calls: 4, models: ['big'] }],
  totals: { total_input: 1_000_500, total_output: 100_050, total_cache_read: 250_000, total_reasoning: 0, total_estimated_cost: 25, total_actual_cost: 0, total_sessions: 4, total_api_calls: 10 },
  tools: { terminal: 3 },
  skills: {}
}

test('normalizeAnalytics maps every field and tolerates junk', () => {
  const a = pure.normalizeAnalytics(raw, 30)
  assert.equal(a.days, 30)
  assert.equal(a.daily.length, 6)
  assert.equal(a.daily[0].cacheRead, 3000)
  assert.equal(a.byModel[0].model, 'big')
  assert.equal(a.byTask[0].task, 'compression')
  assert.deepEqual(a.byTask[0].models, ['big'])
  assert.equal(a.totals.estimated, 25)
  assert.deepEqual(a.tools, { terminal: 3 })
  const empty = pure.normalizeAnalytics(null, 7)
  assert.equal(empty.days, 7)
  assert.deepEqual(empty.daily, [])
  assert.equal(empty.totals.sessions, 0)
})

test('overviewFigures sums today, 7 and 30 day windows, month to date and a projection', () => {
  const a = pure.normalizeAnalytics(raw, 30)
  const f = pure.overviewFigures(a, NOW)
  assert.equal(f.today, 1)
  assert.equal(f.last7, 10, 'offsets 0..6')
  assert.equal(f.last30, 25)
  assert.equal(f.monthToDate, 20, 'the offset-20 row is July 30')
  assert.equal(f.daysLeft, 12)
  assert.ok(Math.abs(f.projectedMonth - (20 + (10 / 7) * 12)) < 1e-9)
  assert.ok(Math.abs(f.cacheHitRate - 250_000 / 1_250_500) < 1e-12)
  assert.equal(f.sessions, 4)
  assert.equal(f.windowSpend, 25)
  assert.equal(pure.overviewFigures(null, NOW).today, 0)
})

test('whatIf prices the same tokens on other models and skips the model itself', () => {
  const rates = pure.optionRates({
    providers: [{ slug: 'openrouter', pricing: { big: { input: '$20', output: '$100' }, small: { input: '$1', output: '$5' }, tiny: { input: '$0.10', output: '$0.50' } } }]
  })
  const row = { model: 'big', input: 1_000_000, output: 100_000 }
  const w = pure.whatIf(row, rates)
  assert.deepEqual(
    w.map(x => x.model),
    ['tiny', 'small']
  )
  assert.ok(Math.abs(w[0].usd - 0.15) < 1e-9)
  assert.ok(Math.abs(w[1].usd - 1.5) < 1e-9)
})

test('whatIf reprices cached reads at the cache rate, or full input when the model lists none', () => {
  const rates = pure.optionRates({
    providers: [{ slug: 'x', pricing: { own: { input: '$3', output: '$15', cache: '$0.30' }, cached: { input: '$1', output: '$5', cache: '$0.10' }, plain: { input: '$0.50', output: '$1' } } }]
  })
  const row = { model: 'own', input: 100_000, cacheRead: 2_000_000, output: 100_000 }
  const w = pure.whatIf(row, rates)
  const by = Object.fromEntries(w.map(x => [x.model, x.usd]))
  assert.ok(Math.abs(by.cached - (0.1 + 0.2 + 0.5)) < 1e-9)
  assert.ok(Math.abs(by.plain - (0.05 + 1.0 + 0.1)) < 1e-9)
})

test('recommendations fire on low cache, heavy aux tasks, unknown pricing, cheaper model, included', () => {
  const a = pure.normalizeAnalytics(raw, 30)
  const mk = (id, over) => ({
    id,
    model: 'big',
    hasUsage: true,
    lastActive: 1,
    tokens: { input: 30000, output: 100, cacheRead: 1000, cacheWrite: 0, reasoning: 0 },
    cost: { estimated: 1, actual: null, status: 'estimated' },
    ...over
  })
  const sessions = [mk('a'), mk('b'), mk('c'), mk('d', { tokens: { input: 1000, output: 0, cacheRead: 30000, cacheWrite: 0, reasoning: 0 } }), mk('e', { cost: { estimated: 0, actual: null, status: 'unknown' }, model: 'mystery' }), mk('f', { cost: { estimated: 0, actual: null, status: 'included' } })]
  const rates = pure.optionRates({ providers: [{ slug: 'x', pricing: { big: { input: '$20', output: '$100' }, small: { input: '$1', output: '$5' } } }] })
  const recs = pure.recommendations(a, sessions, rates)
  const ids = recs.map(r => r.id)
  assert.ok(ids.includes('low-cache'), ids.join(','))
  assert.ok(ids.includes('aux-compression'))
  assert.ok(ids.includes('unknown-pricing'))
  assert.ok(ids.includes('cheaper-model'))
  assert.ok(ids.includes('included'))
  const cheaper = recs.find(r => r.id === 'cheaper-model')
  assert.match(cheaper.title, /small/)
  assert.ok(cheaper.usd > 0)
  assert.equal(pure.recommendations(null, [], {}).length, 0)
})

test('budgetState grades month and session spend against limits', () => {
  const figures = { monthToDate: 85 }
  const session = { cost: { estimated: 2.5, actual: null } }
  const b = pure.budgetState({ month: 100, session: 2 }, figures, session)
  assert.equal(b.month.level, 'near')
  assert.equal(b.month.ratio, 0.85)
  assert.equal(b.session.level, 'over')
  assert.equal(pure.budgetState({}, figures, session).month.level, 'none')
  assert.equal(pure.budgetState({ month: 50 }, figures, null).month.level, 'over')
  assert.equal(pure.budgetState({ month: 200 }, figures, null).month.level, 'ok')
})

test('auxTaskAdvice names the config key, with the review task explained', () => {
  const review = pure.auxTaskAdvice({ task: 'background_review', models: ['m1'] })
  assert.ok(review.includes('auxiliary.background_review.model'))
  assert.ok(review.includes('enabled: false'))
  const vision = pure.auxTaskAdvice({ task: 'vision', models: [] })
  assert.ok(vision.includes('auxiliary.vision.model'))
  assert.ok(vision.includes('the default model'))
})


test('modelUsageLabel says helper tasks only for a model with cost but no sessions', () => {
  const byTask = [{ task: 'title_generation', models: ['gemini-3.5-flash'] }]
  assert.deepEqual(pure.modelUsageLabel({ model: 'google/gemini-3.5-flash', sessions: 0 }, byTask), { kind: 'helper', sessions: 0 })
  assert.deepEqual(pure.modelUsageLabel({ model: 'gemini-3.5-flash', sessions: 3 }, byTask), { kind: 'sessions', sessions: 3 })
  assert.deepEqual(pure.modelUsageLabel({ model: 'other', sessions: 0 }, byTask), { kind: 'sessions', sessions: 0 })
})

test('normalizeAnalytics takes per-model cache reads from the models route', () => {
  const a = pure.normalizeAnalytics(raw, 30, { models: [
    { model: 'big', provider: 'openrouter', cache_read_tokens: 700 },
    { model: 'big', provider: '', cache_read_tokens: 300 }
  ] })
  const row = a.byModel.find(m => m.model === 'big')
  assert.ok(row)
  assert.equal(row.cacheRead, 1000)
  assert.equal(pure.normalizeAnalytics(raw, 30).byModel[0].cacheRead, 0)
})

test('modelRowWrites sums cache writes for the model inside the window and flags partial coverage', () => {
  const now = 3_000_000 * 1000
  const row = (startedAt, model, cacheWrite) => ({ hasUsage: true, startedAt, model, tokens: { cacheWrite } })
  const rows = [row(3_000_000 - 100, 'anthropic/claude-sonnet-5', 1000), row(3_000_000 - 200, 'claude-sonnet-5', 500), row(3_000_000 - 300, 'other', 99)]
  assert.deepEqual(pure.modelRowWrites(rows, 30, 'claude-sonnet-5', now), { writes: 1500, partial: true })
  const full = rows.concat([row(3_000_000 - 40 * 86400, 'claude-sonnet-5', 7)])
  assert.deepEqual(pure.modelRowWrites(full, 30, 'claude-sonnet-5', now), { writes: 1500, partial: false })
  assert.deepEqual(pure.modelRowWrites([], 30, 'claude-sonnet-5', now), { writes: 0, partial: false })
  assert.deepEqual(pure.modelRowWrites(full, 30, 'claude-sonnet-5', now, 5), { writes: 1500, partial: true }, 'fewer rows than the model has sessions: a floor')
})

test('modelRowTip lists the token split and recorded cost, and a list-price split when rates exist', () => {
  const row = { model: 'claude-sonnet-5', input: 97_000, cacheRead: 14_400_000, output: 105_000, estimated: 17.18 }
  const plain = pure.modelRowTip(row, { writes: 1_400_000, partial: false }, {})
  assert.match(plain, /97k input/)
  assert.match(plain, /14\.4M cache read/)
  assert.match(plain, /1\.4M cache write/)
  assert.match(plain, /recorded \$17\.18/)
  assert.ok(!/at list price/.test(plain))
  const rates = { 'anthropic/claude-sonnet-5': { input: 0.000002, output: 0.00001, cache: 0.0000002 } }
  const priced = pure.modelRowTip(row, { writes: 1_400_000, partial: true }, rates)
  assert.match(priced, /at list price/)
  assert.match(priced, /cache write \$3\.50 est/)
  assert.match(priced, /\u22651\.4M cache write/)
})

test('combinedBudgets keeps an own budget, else sums the profile budgets and says so', () => {
  const per = [{ profile: 'a', month: 100, session: 2 }, { profile: 'b', month: 50 }, { profile: 'c' }]
  assert.deepEqual(pure.combinedBudgets({ month: 300, session: 5 }, per), { month: 300, session: 5, derived: false, parts: [{ profile: 'a', month: 100 }, { profile: 'b', month: 50 }] })
  assert.deepEqual(pure.combinedBudgets({ month: null, session: 1 }, per), { month: 150, session: 1, derived: true, parts: [{ profile: 'a', month: 100 }, { profile: 'b', month: 50 }] })
  assert.deepEqual(pure.combinedBudgets(null, []), { month: null, session: null, derived: false, parts: [] })
})

test('optionRates keeps the first provider for a shared bare id and every slug-prefixed id', () => {
  const rates = pure.optionRates({ providers: [
    { slug: 'a', pricing: { shared: { input: '$10', output: '$20' } } },
    { slug: 'b', pricing: { shared: { input: '$0.10', output: '$0.20' } } }
  ] })
  assert.equal(rates.shared.input, 10 / 1_000_000)
  assert.equal(rates['a/shared'].input, 10 / 1_000_000)
  assert.equal(rates['b/shared'].input, 0.1 / 1_000_000)
})

test('budgetState grades a session against the per-session limit', () => {
  const st = pure.budgetState({ month: null, session: 2 }, null, { cost: { actual: 1.7, estimated: null } })
  assert.equal(st.session.level, 'near')
  assert.equal(pure.budgetState({ session: 2 }, null, { cost: { actual: 2.5 } }).session.level, 'over')
  assert.equal(pure.budgetState({ session: 2 }, null, { cost: { actual: 0.2 } }).session.level, 'ok')
})
