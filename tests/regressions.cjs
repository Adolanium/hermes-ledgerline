const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'plugin.js'), 'utf8')

function load() {
  const atom = initial => {
    let value = initial
    const listeners = new Set()
    return { get: () => value, set(v) { value = v; for (const fn of listeners) fn(v) }, listen(fn) { listeners.add(fn); return () => listeners.delete(fn) } }
  }
  const disk = new Map(), timers = new Map(), events = new Map()
  const host = {
    state: { profile: atom('a'), gateway: atom('closed'), connectionId: atom('local'), focusedSessionId: atom('runtime') },
    activeConnectionId: () => host.state.connectionId.get(),
    onEvent(name, fn) { events.set(fn, name); return () => events.delete(fn) },
    notify() {}, request: async () => ({})
  }
  const ctx = vm.createContext({ console, sdk: { host, atom, useValue: a => a.get(), useQuery: o => o, STATUSBAR_AREAS: { right: 'right' }, queryClient: { invalidateQueries() {} } },
    useState: v => [v, () => {}], useMemo: fn => fn(), useRef: v => ({ current: v }), useEffect() {}, jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }),
    setTimeout(fn) { const id = {}; timers.set(id, fn); return id }, clearTimeout(id) { timers.delete(id) }, setInterval() { return {} }, clearInterval() {},
    disk, timers, events, store: { get: (k, fallback) => disk.has(k) ? disk.get(k) : fallback, set: (k, v) => disk.set(k, v), remove: k => disk.delete(k) }
  })
  vm.runInContext(source.replace(/^import .*$/mg, '').replace('export default {', 'globalThis.plugin = {'), ctx)
  vm.runInContext('storage = store', ctx)
  return { ctx, run: code => vm.runInContext(code, ctx), host, disk, timers, events }
}

test('unfinished tools never become successful at turn completion', () => {
  const { run } = load()
  for (const status of ['failed', 'cancelled', 'complete']) {
    const verdict = run(`reduceLiveEvent(reduceLiveEvent(null, {type:'tool.start',session_id:'r',payload:{tool_id:'t',name:'terminal'}},1), {type:'message.complete',session_id:'r',payload:{status:'${status}'}},2).tools[0].verdict`)
    assert.equal(verdict, status === 'complete' ? 'unknown' : 'interrupted')
  }
})

test('parent and child amounts cannot establish inclusive accounting', () => {
  const { run } = load()
  const result = run(`trueCost({session:{id:'p',cost:{actual:10}},rows:[{id:'c',parentId:'p',cost:{actual:3}}]})`)
  assert.equal(result.totalUsd, null)
  assert.equal(result.ownUsd, 10)
  assert.equal(result.accounting, 'unknown')
})

test('ambiguous cron POST failure never retries the write through CLI', async () => {
  const { run } = load()
  run(`globalThis.writes = []; globalThis.adapter = createDataLayer({bridge:{api:async () => {throw Error('response timed out')}}, host:{request:async (...args) => {writes.push(args);return {code:0}}}})`)
  await assert.rejects(run(`adapter.createCronJob({name:'report',schedule:'daily',prompt:'hello',deliver:'local'})`))
  assert.equal(run('writes.length'), 0)
})

test('session response arriving after a profile switch cannot replace current rows', async () => {
  const { run, host } = load()
  run(`data.listSessions = () => new Promise(resolve => globalThis.resolveRows = resolve); globalThis.pendingRows = useSessions(1).queryFn()`)
  host.state.profile.set('b')
  run(`$knownRows.set([{id:'b'}]); $knownRowsScope.set(scopeKey()); resolveRows({rows:[{id:'a'}]})`)
  await run('pendingRows')
  assert.equal(run('$knownRows.get()[0].id'), 'b')
})

test('analysis saves to its originating scope after profile and connection changes', () => {
  const { run, host, disk } = load()
  const owner = run('scopeKey()')
  host.state.profile.set('b'); host.state.connectionId.set('remote')
  run(`saveAnalysis('s', {text:'answer',at:1,status:'done'}, ${JSON.stringify(owner)})`)
  assert.equal(disk.get('analyses@local:a')?.s.text, 'answer')
  assert.equal(run('Object.keys($analyses.get()).length'), 0)
})

test('full audit completion persists text even without a mounted pane', () => {
  const { run, disk } = load()
  run(`saveAnalysis('s',{kind:'audit',runtimeId:'r',text:'',at:1,status:'streaming'}); applyLiveEvent({type:'message.delta',session_id:'r',payload:{text:'Saved answer'}}); applyLiveEvent({type:'message.complete',session_id:'r',payload:{status:'complete'}})`)
  assert.equal(disk.get('analyses@local:a').s.text, 'Saved answer')
  assert.equal(disk.get('analyses@local:a').s.status, 'done')
})

test('disposing a background watcher clears its listener and timeout', () => {
  const { run, timers, events } = load()
  run(`watchBackground('s','task'); for (const dispose of backgroundWatchers.values()) dispose(); backgroundWatchers.clear()`)
  assert.equal(timers.size, 0)
  assert.equal(events.size, 0)
})

test('explicit inclusive and exclusive contracts count nested children once', () => {
  const { run } = load()
  run(`globalThis.parent = {id:'p',cost:{actual:10}}; globalThis.rows = [{id:'c',parentId:'p',cost:{actual:3}},{id:'g',parentId:'c',cost:{actual:1}}]`)
  const inclusive = run(`trueCost({session:parent,rows,accounting:'inclusive'})`)
  assert.equal(inclusive.totalUsd, 10)
  assert.deepEqual(Array.from(inclusive.lines, l => l.usd), [7, 2, 1])
  const exclusive = run(`trueCost({session:parent,rows,accounting:'exclusive'})`)
  assert.equal(exclusive.totalUsd, 14)
  assert.equal(run(`listTreeCost({session:parent,index:childIndex(rows),accounting:'exclusive'})`), 14)
  assert.equal(run(`listTreeCost({session:parent,index:childIndex(rows)})`), null)
})

test('cross-profile descendants do not enter the receipt', () => {
  const { run } = load()
  const receipt = run(`trueCost({session:{id:'p',profile:'a',cost:{actual:10}},rows:[{id:'c',profile:'b',parentId:'p',cost:{actual:3}}]})`)
  assert.equal(receipt.totalUsd, 10)
  assert.equal(receipt.hasTree, false)
})

test('missing child prices remain unknown under an exclusive contract', () => {
  const { run } = load()
  assert.equal(run(`listTreeCost({session:{id:'p',cost:{actual:10}},index:childIndex([{id:'c',parentId:'p',cost:{actual:null}}]),accounting:'exclusive'})`), null)
})

test('a late tool completion replaces interrupted evidence', () => {
  const { run } = load()
  run(`globalThis.record = reduceLiveEvent(null,{type:'tool.start',payload:{tool_id:'t',name:'terminal'}},1); record = reduceLiveEvent(record,{type:'message.complete',payload:{status:'failed'}},2)`)
  const tool = run(`reduceLiveEvent(record,{type:'tool.complete',payload:{tool_id:'t',name:'terminal',result:'{"exit_code":0}'}},3).tools[0]`)
  assert.equal(tool.verdict, 'ok')
  assert.equal(tool.startedAt, 1)
})

test('unsupported cron endpoint uses exactly one CLI fallback', async () => {
  const { run } = load()
  run(`globalThis.writes = []; globalThis.adapter = createDataLayer({bridge:{api:async () => {throw Error('HTTP 404')}},host:{request:async (...args) => {writes.push(args);return {code:0}}}})`)
  await run(`adapter.createCronJob({name:'report',schedule:'daily',prompt:'hello',deliver:'local'})`)
  assert.equal(run('writes.length'), 1)
})

test('audit completion racing prompt.submit response preserves the answer', async () => {
  const { run, host, disk } = load()
  host.request = async method => {
    if (method === 'session.create') return { session_id: 'audit', stored_session_id: 'stored-audit' }
    if (method === 'prompt.submit') run(`applyLiveEvent({type:'message.complete',session_id:'audit',payload:{status:'complete',text:'Immediate answer'}})`)
    return {}
  }
  await run(`runFullAudit({id:'source'},'digest')`)
  assert.equal(disk.get('analyses@local:a').source.text, 'Immediate answer')
  assert.equal(disk.get('analyses@local:a').source.status, 'done')
})

test('audit streaming survives a profile switch and retains long answers', () => {
  const { run, host, disk } = load()
  run(`saveAnalysis('s',{kind:'audit',runtimeId:'r',text:'',at:1,status:'streaming'}); applyLiveEvent({type:'message.delta',session_id:'r',payload:{text:'x'.repeat(50000)}})`)
  host.state.profile.set('b')
  run(`$analyses.set({}); $live.set({}); applyLiveEvent({type:'message.delta',session_id:'r',payload:{text:'tail'}}); applyLiveEvent({type:'message.complete',session_id:'r',payload:{status:'failed',error:'connection lost'}})`)
  assert.equal(disk.get('analyses@local:a').s.text, 'x'.repeat(50000) + 'tail')
  assert.equal(disk.get('analyses@local:a').s.status, 'interrupted')
  assert.equal(run('Object.keys($analyses.get()).length'), 0)
})

test('stored audit recovery preserves uncertainty and survives remount', async () => {
  const { run, disk } = load()
  run(`saveAnalysis('s',{kind:'audit',runtimeId:'r',storedId:'stored',text:'',at:1,status:'streaming'}); data.getMessages = async () => ({messages:[{role:'assistant',content:'Recovered answer'}],truncated:false})`)
  await run(`recoverAudit({id:'s'},$analyses.get().s)`)
  assert.equal(disk.get('analyses@local:a').s.text, 'Recovered answer')
  assert.equal(disk.get('analyses@local:a').s.status, 'interrupted')
  run(`$analyses.set({}); $analyses.set(storedScoped('analyses',{}))`)
  assert.equal(run('$analyses.get().s.text'), 'Recovered answer')
})

test('background completion saves to the original profile and disposes', () => {
  const { run, host, disk, timers, events } = load()
  run(`saveAnalysis('s',{kind:'background',taskId:'task',text:'',at:1,status:'running'}); watchBackground('s','task')`)
  host.state.profile.set('b'); run('$analyses.set({})')
  for (const [fn, name] of events) if (name === 'background.complete') fn({ payload: { task_id: 'task', text: 'Background answer' } })
  assert.equal(disk.get('analyses@local:a').s.text, 'Background answer')
  assert.equal(timers.size, 0)
  assert.equal(events.size, 0)
})

test('unsupported lifecycle fails before registering listeners', () => {
  const { run, events } = load()
  assert.throws(() => run('plugin.register({})'), /onDispose/)
  assert.equal(events.size, 0)
})

test('message query caches are separated by connection', () => {
  const { run, host } = load()
  const first = run(`useAnalysis({id:'s',profile:'a',messageCount:1}).queryKey.join('/')`)
  host.state.connectionId.set('remote')
  const second = run(`useAnalysis({id:'s',profile:'a',messageCount:1}).queryKey.join('/')`)
  assert.notEqual(first, second)
})

test('paginated message reads stop when the connection changes', async () => {
  const { run, host } = load()
  run(`globalThis.calls = 0; globalThis.adapter = createDataLayer({host:sdk.host,bridge:{api:() => {calls++;return new Promise(resolve => globalThis.resolvePage = resolve)}}}); globalThis.pending = adapter.getMessages('s')`)
  host.state.connectionId.set('remote')
  run(`resolvePage({messages:Array.from({length:500},()=>({role:'user',content:'a'}))})`)
  await assert.rejects(run('pending'), /connection changed/)
  assert.equal(run('calls'), 1)
})
