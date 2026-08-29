import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPure } from './helpers/pure.mjs'
import { delegated, failedTerminal, writeFile } from './fixtures/messages.mjs'

const pure = loadPure()

test('classifyToolResult follows the CLI rules and splits weak matches into suspected', () => {
  const c = pure.classifyToolResult
  assert.deepEqual(c('terminal', null), { verdict: 'ok', error: '' })
  assert.deepEqual(c('terminal', JSON.stringify({ exit_code: 0 })), { verdict: 'ok', error: '' })
  assert.deepEqual(c('terminal', JSON.stringify({ exit_code: 2 })), { verdict: 'failed', error: 'exit 2' })
  assert.deepEqual(c('terminal', JSON.stringify({ exit_code: 1, error: 'boom' })), { verdict: 'failed', error: 'boom' })
  assert.deepEqual(c('terminal', 'Error: something'), { verdict: 'ok', error: '' }, 'terminal never uses the substring rule')
  assert.deepEqual(c('write_file', JSON.stringify({ bytes_written: 10 })), { verdict: 'ok', error: '' })
  assert.deepEqual(c('write_file', JSON.stringify({ error: 'disk full' })), { verdict: 'failed', error: 'disk full' })
  assert.deepEqual(c('patch', JSON.stringify({ success: true })), { verdict: 'ok', error: '' })
  assert.deepEqual(c('patch', JSON.stringify({ success: false, message: 'hunk failed' })), { verdict: 'failed', error: 'hunk failed' })
  assert.deepEqual(c('memory', JSON.stringify({ success: false, error: 'would exceed the limit' })), { verdict: 'failed', error: 'memory store full' })
  assert.equal(c('read_file', 'Error: File not found: /x').verdict, 'suspected')
  assert.equal(c('read_file', 'plain text containing "error" in a quote').verdict, 'suspected')
  assert.equal(c('read_file', 'all good').verdict, 'ok')
  assert.equal(c('read_file', { _multimodal: true }).verdict, 'ok')
  assert.equal(c('web_search', 'x'.repeat(600) + '"failed"').verdict, 'ok', 'only the first 500 chars are scanned')
})

test('analyzeMessages: failed terminal session', () => {
  const a = pure.analyzeMessages(failedTerminal)
  assert.equal(a.about, 'run the tests')
  assert.equal(a.calls.length, 2)
  assert.deepEqual(a.breakdown, [{ name: 'terminal', count: 2, failed: 1, suspected: 0 }])
  assert.equal(a.failures.length, 1)
  assert.equal(a.failures[0].error, 'tests failed')
  assert.deepEqual(a.failures[0].args, { command: 'npm test' })
  assert.equal(a.counts.failed, 1)
  assert.equal(a.files.length, 0)
  assert.equal(a.summary, '2 tool calls across 1 tool (1 failed); 0 file writes')
})

test('analyzeMessages: files touched, write verdicts, about skips system rows', () => {
  const a = pure.analyzeMessages(writeFile)
  assert.equal(a.about, 'add a readme')
  assert.equal(a.counts.toolCalls, 4)
  assert.equal(a.counts.failed, 0)
  assert.equal(a.counts.suspected, 2, 'read_file error text and search hit are suspected, not failed')
  assert.deepEqual(a.files.map(f => [f.path, f.reads, f.writes]), [
    ['/repo/README.md', 1, 2],
    ['/repo', 1, 0]
  ])
  assert.deepEqual(a.files[0].tools, ['read_file', 'write_file', 'patch'])
  assert.equal(a.counts.writes, 1)
  assert.match(a.summary, /^4 tool calls across 4 tools \(2 suspected\); 1 file write \(README.md\)$/)
})

test('analyzeMessages: subagents from delegate_task results with goals from args', () => {
  const a = pure.analyzeMessages(delegated)
  assert.equal(a.subagents.length, 2)
  assert.equal(a.subagents[0].goal, 'write tests')
  assert.equal(a.subagents[0].status, 'completed')
  assert.equal(a.subagents[0].costUsd, 0.002)
  assert.equal(a.subagents[0].tokens.input, 1000)
  assert.equal(a.subagents[1].goal, 'write docs')
  assert.equal(a.subagents[1].error, 'timed out')
  assert.equal(a.subagents[1].dispatchedAt, 301)
  assert.equal(a.counts.subagentFailed, 1)
  assert.match(a.summary, /2 subagents \(1 not completed\)$/)
})

test('analyzeMessages tolerates junk rows and empty input', () => {
  const a = pure.analyzeMessages([null, {}, { role: 'assistant', tool_calls: 'nope' }, { role: 'assistant', tool_calls: [null, { id: 'z' }] }])
  assert.equal(a.calls.length, 1)
  assert.equal(a.calls[0].name, 'unknown')
  assert.equal(pure.analyzeMessages(undefined).counts.toolCalls, 0)
})

test('getMessages walks pages until a short page and flags truncation', async () => {
  const pages = []
  const data = pure.createDataLayer({
    host: {},
    bridge: {
      api: async req => {
        pages.push(req.path)
        const offset = Number(new URL('http://x' + req.path).searchParams.get('offset'))
        const count = offset === 0 ? 500 : 3
        return { messages: Array.from({ length: count }, (_, i) => ({ role: 'user', content: String(offset + i) })) }
      }
    }
  })
  const r = await data.getMessages('abc')
  assert.equal(r.messages.length, 503)
  assert.equal(r.truncated, false, 'a short page ends the walk cleanly')
  assert.equal(pages.length, 2)
  assert.ok(pages[0].includes('/api/sessions/abc/messages?limit=500&offset=0'))
})

test('classifyToolResult does not fail a result whose error key is empty', () => {
  // the word "error" in the text still earns the weak "suspected" tier, never "failed"
  assert.notEqual(pure.classifyToolResult('write_file', '{"error":null,"message":"created file"}').verdict, 'failed')
  assert.notEqual(pure.classifyToolResult('write_file', '{"error":"","success":true}').verdict, 'failed')
  assert.equal(pure.classifyToolResult('write_file', '{"error":"disk full"}').verdict, 'failed')
  assert.equal(pure.classifyToolResult('write_file', '{"success":false,"message":"nope"}').verdict, 'failed')
})

test('callSummary says what a call did in one line', () => {
  assert.equal(pure.callSummary('terminal', { command: 'cd ~/code && uv run pytest -q' }), 'cd ~/code && uv run pytest -q')
  assert.equal(pure.callSummary('read_file', { path: '~/code/src/main.py' }), '~/code/src/main.py')
  assert.equal(pure.callSummary('search_files', { pattern: 'TODO', workdir: '~/code' }), 'TODO in ~/code')
  assert.equal(pure.callSummary('delegate_task', { tasks: [{ goal: 'port search' }, { goal: 'write tests' }] }), '2 tasks: port search | write tests')
  assert.equal(pure.callSummary('web_search', { query: 'restic slow backup' }), 'restic slow backup')
  assert.equal(pure.callSummary('mystery_tool', { a: 'one', b: 42, c: 'two' }), 'one · two')
  assert.equal(pure.callSummary('mystery_tool', {}), '')
  assert.equal(pure.callSummary('terminal', null), '')
  assert.ok(pure.callSummary('terminal', { command: 'x'.repeat(500) }).length <= 160)
})
