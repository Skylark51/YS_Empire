import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../game-ui.js', import.meta.url), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'game-ui.js' });
const ui = context.YSGameUI;
assert.ok(ui, 'YSGameUI export missing');

const states = [
  [{ state: 'idle', job: { detected: false } }, 'idle'],
  [{ state: 'running', metrics: { cpu_percent: 35 }, job: { detected: true } }, 'running'],
  [{ state: 'running', metrics: { cpu_percent: 96 }, job: { detected: true } }, 'high-load'],
  [{ state: 'finished', job: { normal_termination: true } }, 'finished'],
  [{ state: 'failed', job: { error_termination: true } }, 'failed'],
  [{ state: 'offline', reachable: false }, 'offline']
];
for (const [node, expected] of states) assert.equal(ui.deriveGameState(node, { cpu: '16 cores' }), expected);
assert.equal(ui.deriveGameState({ state: 'running', load1: 13 }, { cpu: '16 cores' }), 'high-load');
assert.equal(ui.deriveGameState({ state: 'running', job: { normal_termination: true } }, {}), 'finished');
assert.equal(ui.deriveGameState({ state: 'running', job: { error_termination: true } }, {}), 'failed');

const detail = ui.detailModel({
  state: 'running',
  metrics: { cpu_percent: 87.5, memory_percent: 61, load_1: 9, load_5: 7, load_15: 5 },
  job: { name: 'Fe scan', input_file: 'input.gjf', output_file: 'output.log', working_directory: '/calc/fe', started_at: '2026-07-26T01:00:00Z', elapsed_seconds: 3723 }
}, {});
assert.equal(detail.calculation, 'Fe scan');
assert.equal(detail.input, 'input.gjf');
assert.equal(detail.output, 'output.log');
assert.equal(detail.directory, '/calc/fe');
assert.equal(detail.cpu, '87.5%');
assert.equal(detail.memory, '61%');
assert.equal(detail.load, '9 / 7 / 5');
assert.equal(detail.elapsed, '1시간 2분');
assert.equal(detail.termination, '실행 중');
assert.equal(ui.getMemo({ memo: 'TS 확인' }, 'lion28'), 'TS 확인');

const live = fs.readFileSync(new URL('../live.js', import.meta.url), 'utf8');
const paths = [...live.matchAll(/\/api\/[a-z0-9_-]+/gi)].map(match => match[0]);
assert.ok(paths.length >= 1);
assert.deepEqual([...new Set(paths)], ['/api/status']);
assert.equal(/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(live), false);
assert.match(live, /monitorManaged/);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(html.indexOf('game-ui.css') > html.indexOf('live.css'));
assert.ok(html.indexOf('game-ui.js') > html.indexOf('live.js'));
const gameSource = source;
assert.match(gameSource, /serverMemoInput[^>]*[\s\S]*disabled/);
assert.match(gameSource, /saveServerMemoBtn[^>]*[\s\S]*disabled/);
assert.equal(/localStorage/.test(gameSource), false);

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(app, /!server\.monitorManaged/);
const css = fs.readFileSync(new URL('../game-ui.css', import.meta.url), 'utf8');
assert.match(gameSource, /pixel-office-world/);
assert.match(gameSource, /command-deck/);
assert.match(gameSource, /office-npc/);
assert.match(gameSource, /function selectNpc/);
assert.match(gameSource, /selectServer\(id\)/);
assert.match(gameSource, /직원 NPC를 클릭/);
assert.match(css, /\.pixel-office-world/);
assert.match(css, /\.boss-command-scene/);
assert.match(css, /\.office-npc\.server-card/);
assert.match(css, /\.office-zone-layout/);
assert.match(css, /@media \(max-width: 720px\)/);
assert.doesNotMatch(gameSource, /fetch\s*\(/);
console.log('PASS: 6 game states, office map/NPC/detail wiring, responsive layout, memo policy, /api/status-only contract');