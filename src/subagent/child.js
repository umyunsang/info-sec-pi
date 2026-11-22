import { piSdk } from '../pi-sdk.js';
import { runSession } from '../session.js';

try {
  const { appendSystemPrompt, diagnostics, messages, model, thinking, tools } = piSdk.parseArgs(process.argv.slice(2));
  const error = diagnostics.find(diagnostic => diagnostic.type === 'error');
  if (error) throw new Error(error.message);
  if (messages.length !== 1) throw new Error('A subagent requires one task.');

  process.exitCode = await runSession({
    isSubagent: true,
    inMemory: true,
    prompt: messages[0],
    modelSelector: model,
    thinkingLevel: thinking,
    tools,
    appendSystemPrompt,
  });
} catch (error) {
  process.stderr.write(`isp subagent: ${error.message}\n`);
  process.exitCode = 1;
}
