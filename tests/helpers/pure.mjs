// Loads the pure slice of plugin.js (between the @ledgerline:pure markers)
// and returns its top-level functions and classes. The slice has no imports
// by design, so it runs under plain node. It runs in the test process itself (not
// a vm context) so objects it creates share the tests' prototypes and
// deepEqual works.
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../plugin.js', import.meta.url), 'utf8')

export function loadPure() {
  const start = source.indexOf('/* @ledgerline:pure-start */')
  const end = source.indexOf('/* @ledgerline:pure-end */')
  if (start < 0 || end < start) throw new Error('pure markers not found in plugin.js')

  const slice = source.slice(start, end)
  const exported = [
    'PLUGIN_ID',
    'ROUTE',
    'PAGE_SIZE',
    'LedgerlineError',
    'describeCapabilities',
    'createDataLayer',
    'resolveMode',
    'normalizeRestSession',
    'normalizeRpcSession',
    'sessionCost',
    'cacheHitRate',
    'rowsCacheRate',
    'modelRowWrites',
    'modelRowTip',
    'tokenTotal',
    'sessionLabel',
    'durationSeconds',
    'filterSessions',
    'sortSessions',
    'distinct',
    'fmtUsd',
    'fmtCount',
    'fmtPct',
    'fmtDuration',
    'fmtWhen',
    'classifyToolResult',
    'callSummary',
    'analyzeMessages',
    'reduceLiveEvent',
    'blendedRates',
    'optionRates',
    'estimateUsd',
    'normalizeAnalytics',
    'overviewFigures',
    'whatIf',
    'modelUsageLabel',
    'recommendations',
    'budgetState',
    'combinedBudgets',
    'buildDigest',
    'EXPLAIN_INSTRUCTIONS',
    'auditPrompt',
    'wrapDigest',
    'pickRoute',
    'routeStillHeld',
    'mergeKnownRows',
    'mergeSearchHits',
    'parseSendTargets',
    'normalizeCronJob',
    'reportPrompt',
    'scanSummary',
    'scanKey',
    'sortWorst',
    'auxTaskAdvice',
    'mergeAnalytics'
  ]
  return new Function(`${slice}\nreturn { ${exported.join(', ')} }`)()
}
