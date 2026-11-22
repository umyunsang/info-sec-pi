import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai';
import { Agent } from '../packages/agent-core/dist/index.js';
import { piSdk } from '../src/pi-sdk.js';

test('the isp session uses the compiled info-sec-pi Agent', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'isp-core-binding-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const agentDir = join(cwd, 'profile');
  const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = piSdk;
  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager, noContextFiles: true, noExtensions: true, noSkills: true,
  });
  await resourceLoader.reload();
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'), modelsPath: null,
    allowModelNetwork: false, refreshOnCreate: false,
  });
  const fake = fauxProvider({ provider: 'isp-core-binding', api: 'isp-core-binding' });
  fake.setResponses([fauxAssistantMessage('hello from the core')]);
  modelRuntime.registerNativeProvider(fake.provider);
  const { session } = await createAgentSession({
    cwd, agentDir, model: fake.getModel(), modelRuntime, settingsManager, resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
  });
  try {
    assert.equal(session.agent.constructor, Agent);
    await session.prompt('hello');
    assert.equal(session.getLastAssistantText(), 'hello from the core');
  } finally {
    session.dispose();
  }
});
