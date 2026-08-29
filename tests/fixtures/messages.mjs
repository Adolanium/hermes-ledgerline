// Synthetic message rows shaped like /api/sessions/{id}/messages output:
// role, content, tool_calls (parsed list on assistant rows), tool_call_id and
// tool_name on tool rows, timestamp. Nothing here comes from a real session.

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })

export const failedTerminal = [
  { role: 'user', content: 'run the tests', timestamp: 100 },
  { role: 'assistant', content: '', tool_calls: [call('c1', 'terminal', { command: 'npm test' })], timestamp: 101 },
  { role: 'tool', tool_call_id: 'c1', tool_name: 'terminal', content: JSON.stringify({ exit_code: 1, output: '3 failing', error: 'tests failed' }), timestamp: 102 },
  { role: 'assistant', content: '', tool_calls: [call('c2', 'terminal', { command: 'npm test -- --grep x' })], timestamp: 103 },
  { role: 'tool', tool_call_id: 'c2', tool_name: 'terminal', content: JSON.stringify({ exit_code: 0, output: 'ok' }), timestamp: 104 },
  { role: 'assistant', content: 'done', timestamp: 105 }
]

export const writeFile = [
  { role: 'user', content: '[System: resumed]', timestamp: 200 },
  { role: 'user', content: 'add a readme', timestamp: 201 },
  { role: 'assistant', content: '', tool_calls: [call('w1', 'read_file', { path: '/repo/README.md' })], timestamp: 202 },
  { role: 'tool', tool_call_id: 'w1', tool_name: 'read_file', content: 'Error: File not found: /repo/README.md', timestamp: 203 },
  { role: 'assistant', content: '', tool_calls: [call('w2', 'write_file', { path: '/repo/README.md', content: '# hi' })], timestamp: 204 },
  { role: 'tool', tool_call_id: 'w2', tool_name: 'write_file', content: JSON.stringify({ bytes_written: 4, path: '/repo/README.md' }), timestamp: 205 },
  { role: 'assistant', content: '', tool_calls: [call('w3', 'patch', { path: '/repo/README.md', patch: '...' })], timestamp: 206 },
  { role: 'tool', tool_call_id: 'w3', tool_name: 'patch', content: JSON.stringify({ success: true }), timestamp: 207 },
  { role: 'assistant', content: '', tool_calls: [call('w4', 'search_files', { workdir: '/repo', pattern: 'error handling' })], timestamp: 208 },
  { role: 'tool', tool_call_id: 'w4', tool_name: 'search_files', content: 'src/a.js: // "error" is logged here', timestamp: 209 }
]

export const delegated = [
  { role: 'user', content: 'split the work', timestamp: 300 },
  {
    role: 'assistant',
    content: '',
    tool_calls: [call('d1', 'delegate_task', { tasks: [{ goal: 'write tests' }, { goal: 'write docs' }] })],
    timestamp: 301
  },
  {
    role: 'tool',
    tool_call_id: 'd1',
    tool_name: 'delegate_task',
    content: JSON.stringify({
      results: [
        { task_index: 0, status: 'completed', summary: 'tests written', api_calls: 4, duration_seconds: 30, model: 'm-small', tokens: { input: 1000, output: 200 }, cost_usd: 0.002, cost_status: 'estimated' },
        { task_index: 1, status: 'failed', summary: '', api_calls: 1, duration_seconds: 5, model: 'm-small', tokens: { input: 100, output: 0 }, cost_usd: 0, cost_status: 'estimated', error: 'timed out' }
      ],
      total_duration_seconds: 35
    }),
    timestamp: 340
  }
]
