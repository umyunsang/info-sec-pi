import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const cli = fileURLToPath(new URL('../bin/isp.js', import.meta.url));
const piCli = fileURLToPath(new URL('./bundle/cli.js', import.meta.resolve('@earendil-works/pi-coding-agent')));
const provider = new URL('./fixtures/provider.js', import.meta.url);

async function installProvider(state) {
  await mkdir(join(state, 'extensions'), { recursive: true });
  await copyFile(provider, join(state, 'extensions', 'fixture.js'));
  await writeFile(join(state, 'settings.json'), JSON.stringify({
    defaultProvider: 'isp-test',
    defaultModel: 'fixture',
    retry: { enabled: false },
    enableInstallTelemetry: false,
  }));
}

async function fixture(t, { relativeProfile = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'isp-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, 'isp', 'agent');
  const sessions = join(root, 'isp', 'sessions');
  const piState = join(root, 'pi', 'agent');
  const piSessions = join(root, 'pi', 'sessions');
  const cwd = join(root, 'project');
  await mkdir(cwd);
  await installProvider(state);
  const env = {
    PATH: process.env.PATH,
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ISP_CODING_AGENT_DIR: relativeProfile ? relative(cwd, state) : state,
    ISP_SESSION_DIR: sessions,
    PI_CODING_AGENT_DIR: piState,
    PI_CODING_AGENT_SESSION_DIR: piSessions,
    PI_SKIP_VERSION_CHECK: '1',
    PI_OFFLINE: '1',
  };
  function invoke(entry, args, input = '', directory = cwd) {
    const result = spawnSync(process.execPath, [entry, ...args], {
      cwd: directory, env, input, encoding: 'utf8', timeout: 25000,
    });
    if (result.error) throw result.error;
    assert.equal(result.signal, null);
    return result;
  }
  function run(args, input, directory) {
    return invoke(cli, args, input, directory);
  }
  function ask(args, input, directory) {
    const result = run(['--model', 'isp-test/fixture', ...args], input, directory);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }
  return { cwd, root, sessions, state, piState, piSessions, run, ask, runPi: args => invoke(piCli, args) };
}

test('help, version and usage errors work before a session is created', async t => {
  const { run, sessions } = await fixture(t);
  let result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /isp \(info-sec-pi\)/);
  result = run(['--version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, pkg.version + '\n');
  for (const args of [
    [], ['--invalid'], ['-p'], ['--model', 'invalid'], ['-c', '--no-session'],
    ['--session', ''], ['-c', '--session', 'some-id'],
  ]) {
    result = run(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /isp:/);
  }
  await assert.rejects(readdir(sessions), { code: 'ENOENT' });
});

test('piped input and instructions reach the model without persisting an in-memory turn', async t => {
  const { run, ask, sessions } = await fixture(t);
  const configured = run(['--no-session', 'explain'], 'first\nsecond');
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(configured.stdout, 'echo: explain\n\nfirst\nsecond\n');
  assert.equal(ask(['-p', '--no-session'], 'stdin only'), 'echo: stdin only\n');
  await assert.rejects(readdir(sessions), { code: 'ENOENT' });
});

test('Pi reads the working file and isp resumes only the most recent session for that directory', async t => {
  const { run, ask, cwd, root, sessions } = await fixture(t);
  await writeFile(join(cwd, 'fixture.txt'), 'project notes');
  assert.equal(ask(['-p', 'read fixture']), 'read: project notes\n');
  const [file] = await readdir(sessions);
  const entries = (await readFile(join(sessions, file), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(entries.some(entry => entry.message?.role === 'toolResult' && entry.message.toolName === 'read'));

  const secondDirectory = join(root, 'another-project');
  await mkdir(secondDirectory);
  assert.equal(ask(['-c', 'history'], '', secondDirectory), 'history: 1\n');
  const resumed = run(['-c', 'history']);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(resumed.stdout, 'history: 2\n');
  assert.equal(ask(['--session-dir', sessions, '--session', entries[0].id, 'history']), 'history: 3\n');
  const otherSession = run(['--session', entries[0].id, 'history'], '', secondDirectory);
  assert.equal(otherSession.status, 1);
  assert.match(otherSession.stderr, /No isp session with ID/);
  assert.equal((await readdir(sessions)).length, 2);
});

test('isp and stock Pi use their own user profile, project resources, trust and sessions', async t => {
  const { cwd, state, sessions, piState, piSessions, ask, runPi } = await fixture(t);
  await installProvider(piState);
  for (const [dir, config, name] of [[state, '.isp', 'ISP'], [piState, '.pi', 'PI']]) {
    const projectConfig = join(cwd, config);
    await mkdir(join(projectConfig, 'extensions'), { recursive: true });
    await writeFile(join(dir, 'SYSTEM.md'), name + '_USER_CONTEXT');
    await writeFile(join(projectConfig, 'APPEND_SYSTEM.md'), name + '_PROJECT_CONTEXT');
    await writeFile(join(projectConfig, 'extensions', 'profile.js'), `
      export default function (api) {
        api.on('before_agent_start', event => ({
          systemPrompt: event.systemPrompt + '\\n${name}_EXTENSION_CONTEXT',
        }));
      }
    `);
  }

  const trusted = JSON.stringify({ [await realpath(cwd)]: true });
  await writeFile(join(piState, 'trust.json'), trusted);
  assert.equal(ask(['-p', '--no-session', 'inspect profile']), 'ISP_USER_CONTEXT\n');
  const pi = runPi(['-p', 'inspect profile']);
  assert.equal(pi.status, 0, pi.stderr);
  assert.equal(pi.stdout, 'PI_EXTENSION_CONTEXT,PI_PROJECT_CONTEXT,PI_USER_CONTEXT\n');

  await writeFile(join(state, 'trust.json'), trusted);
  assert.equal(ask(['-p', 'inspect profile']), 'ISP_EXTENSION_CONTEXT,ISP_PROJECT_CONTEXT,ISP_USER_CONTEXT\n');
  assert.equal((await readdir(sessions)).length, 1);
  assert.equal((await readdir(piSessions)).length, 1);
});

test('model errors reach stderr and produce a nonzero exit code', async t => {
  const { run } = await fixture(t);
  const missing = run(['-p', '--no-session', '--model', 'isp-test/missing', 'hello']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Unknown isp model: isp-test\/missing/);
  const failed = run(['-p', '--no-session', '--model', 'isp-test/fixture', 'fail fixture']);
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /Fixture request failed/);
});

test('the official subagent extension delegates, runs parallel tasks and passes results along a chain', async t => {
  const { ask, cwd, sessions } = await fixture(t, { relativeProfile: true });
  const childDirectory = join(cwd, 'child');
  await mkdir(childDirectory);
  await writeFile(join(childDirectory, 'fixture.txt'), '자식 작업 디렉터리');
  const delegate = params => ask(['-p', `delegate ${JSON.stringify(params)}`]);

  assert.equal(delegate({ agent: 'planner', task: 'read fixture as planner', cwd: 'child' }), 'read: 자식 작업 디렉터리\n');
  const parallel = delegate({ tasks: [
    { agent: 'scout', task: '왼쪽' },
    { agent: 'reviewer', task: '오른쪽' },
  ] });
  assert.match(parallel, /Parallel: 2\/2 succeeded/);
  assert.match(parallel, /echo: Task: 왼쪽/);
  assert.match(parallel, /echo: Task: 오른쪽/);
  assert.equal(delegate({ chain: [
    { agent: 'scout', task: 'first' },
    { agent: 'planner', task: 'next received {previous}' },
  ] }), 'echo: Task: next received echo: Task: first\n');

  assert.equal(ask(['-p', '--no-session', '/scout-and-plan template fixture']), 'loaded official workflow\n');
  assert.equal((await readdir(sessions)).length, 3);
});

test('the examples catalog exposes every shipped entry and loads a selected extension', async t => {
  const { run } = await fixture(t);
  const result = run(['examples', 'list']);
  assert.equal(result.status, 0, result.stderr);
  const entries = result.stdout.trim().split('\n');
  assert.equal(new Set(entries).size, 94);
  assert.equal(entries.filter(entry => entry.startsWith('extension\t')).length, 78);
  assert.equal(entries.filter(entry => entry.startsWith('sdk\t')).length, 14);
  assert.equal(entries.filter(entry => entry.startsWith('rpc\t')).length, 2);
  assert.equal(run(['examples', 'run', '../unexpected']).status, 2);

  const normal = run(['-p', '--no-session', 'inspect tools']);
  assert.equal(normal.status, 0, normal.stderr);
  assert.doesNotMatch(normal.stdout, /parse_duration/);
  const selected = run(['examples', 'run', 'with-deps', '-p', '--no-session', 'inspect tools']);
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /parse_duration/);
});

test('the SDK and RPC examples run through isp with the test model', async t => {
  const { run } = await fixture(t);
  const sdk = run(['examples', 'run', '05-tools']);
  assert.equal(sdk.status, 0, sdk.stderr);
  assert.match(sdk.stdout, /Read-only session created/);

  const rpc = run(['examples', 'run', 'rpc-client', 'RPC fixture']);
  assert.equal(rpc.status, 0, rpc.stderr);
  assert.match(rpc.stdout, /echo: RPC fixture/);
});
