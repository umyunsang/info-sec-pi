import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import { piSdk } from './pi-sdk.js';

const {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  hasTrustRequiringProjectResources,
  initTheme,
  InteractiveMode,
  ProjectTrustStore,
  resolveCliModel,
  runPrintMode,
  SessionManager,
  SettingsManager,
} = piSdk;

const subagentExtension = fileURLToPath(new URL('./subagent/index.ts', import.meta.url));
const subagentPrompts = fileURLToPath(new URL('./subagent/prompts/', import.meta.url));

function ispHeader(pi) {
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    const title = `isp ${pkg.version}`;
    ctx.ui.setHeader((_tui, theme) => ({
      render: width => [theme.fg('accent', title.slice(0, width))],
      invalidate() {},
    }));
  });
}

async function createIspSession(
  { cwd, agentDir, sessionManager, sessionStartEvent },
  { modelSelector, isSubagent, tools, appendSystemPrompt, thinkingLevel },
) {
  const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
  const savedTrust = new ProjectTrustStore(agentDir).get(cwd);
  const projectTrusted = savedTrust ?? (
    !hasTrustRequiringProjectResources(cwd) || settingsManager.getDefaultProjectTrust() === 'always'
  );
  settingsManager.setProjectTrusted(projectTrusted);

  const services = await createAgentSessionServices({
    cwd,
    agentDir,
    settingsManager,
    modelRuntimeSignal: AbortSignal.timeout(15000),
    resourceLoaderOptions: {
      extensionFactories: [ispHeader],
      additionalExtensionPaths: isSubagent ? [] : [subagentExtension],
      additionalPromptTemplatePaths: isSubagent ? [] : [subagentPrompts],
      appendSystemPrompt,
    },
  });

  const diagnostics = [...services.diagnostics];
  let model;
  if (modelSelector && isSubagent) {
    const resolved = resolveCliModel({ cliModel: modelSelector, cliThinking: thinkingLevel, modelRuntime: services.modelRuntime });
    if (resolved.error) throw new Error(resolved.error);
    if (resolved.warning) diagnostics.push({ type: 'warning', message: resolved.warning });
    model = resolved.model;
    thinkingLevel ??= resolved.thinkingLevel;
  } else if (modelSelector) {
    const slash = modelSelector.indexOf('/');
    model = services.modelRuntime.getModel(modelSelector.slice(0, slash), modelSelector.slice(slash + 1));
    if (!model) throw new Error(`Unknown isp model: ${modelSelector}. Use /model in the interactive terminal.`);
  }
  const created = await createAgentSessionFromServices({
    services, sessionManager, sessionStartEvent, model, tools, thinkingLevel,
  });
  if (created.modelFallbackMessage) {
    diagnostics.push({ type: 'warning', message: created.modelFallbackMessage });
  }
  return { ...created, services, diagnostics };
}

function selectSession(cwd, { inMemory, continueSession, sessionId, sessionDirectory }) {
  if (inMemory) return SessionManager.inMemory(cwd);
  const sessionDir = resolve(
    sessionDirectory || process.env.ISP_SESSION_DIR || join(homedir(), pkg.piConfig.configDir, 'sessions'),
  );
  if (sessionId) {
    const file = SessionManager.findById(cwd, sessionId, sessionDir);
    if (!file) throw new Error(`No isp session with ID ${sessionId} in this directory.`);
    return SessionManager.open(file, sessionDir);
  }
  if (continueSession) return SessionManager.continueRecent(cwd, sessionDir);
  return SessionManager.create(cwd, sessionDir);
}

export async function runSession({ interactive, prompt, ...sessionOptions }) {
  const cwd = process.cwd();
  const agentDir = getAgentDir();
  const sessionManager = selectSession(cwd, sessionOptions);
  const runtime = await createAgentSessionRuntime(
    options => createIspSession(options, sessionOptions),
    { cwd, agentDir, sessionManager },
  );
  const startupDiagnostics = runtime.takeUnreportedDiagnostics();
  initTheme(runtime.services.settingsManager.getTheme());

  if (interactive) {
    let ui;
    try {
      ui = new InteractiveMode(runtime, {
        initialMessage: prompt || undefined,
        startupDiagnostics,
      });
      await ui.run();
    } finally {
      ui?.stop();
      await runtime.dispose();
    }
    return 0;
  }

  for (const diagnostic of startupDiagnostics) process.stderr.write(`isp: ${diagnostic.message}\n`);

  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    void runtime.session.abort().catch(() => {});
  };
  process.on('SIGINT', interrupt);
  try {
    // Pi's print driver binds extensions and disposes the runtime on completion.
    const code = await runPrintMode(runtime, { mode: sessionOptions.isSubagent ? 'json' : 'text', initialMessage: prompt });
    return interrupted ? 130 : code;
  } finally {
    process.off('SIGINT', interrupt);
  }
}
