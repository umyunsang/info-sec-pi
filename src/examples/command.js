import { readFileSync, realpathSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listExamples } from './catalog.js';

const usage = `Pi examples for isp

Usage
  isp examples list                  List bundled extension, SDK and RPC examples
  isp examples path NAME             Show the example entry point
  isp examples run NAME [ARGS...]    Run an example
`;

async function runScript(example, args) {
  await import('../pi-sdk.js');
  const entry = pathToFileURL(realpathSync(example.path)).href;
  // Node normally skips TypeScript stripping inside node_modules. Compile the
  // one selected sample while keeping its package-relative imports intact.
  const hook = registerHooks({
    load(url, context, nextLoad) {
      if (url !== entry) return nextLoad(url, context);
      const source = readFileSync(new URL(url), 'utf8');
      return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(source) };
    },
  });
  const previousArgv = process.argv;
  process.argv = [process.execPath, example.path, ...args];
  try {
    await import(entry);
    return process.exitCode ?? 0;
  } finally {
    hook.deregister();
    process.argv = previousArgv;
  }
}

export async function runExamples([command, name, ...args]) {
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(usage);
    return 0;
  }
  if ((command === 'list' && name !== undefined) || !['list', 'path', 'run'].includes(command)) {
    process.stderr.write(`isp: Invalid examples command.\n${usage}`);
    return 2;
  }
  const catalog = listExamples();
  if (command === 'list') {
    for (const example of catalog) process.stdout.write(`${example.kind}\t${example.name}\n`);
    return 0;
  }

  const example = catalog.find(entry => entry.name === name);
  if (!example || (command === 'path' && args.length)) {
    process.stderr.write(`isp: Use 'isp examples ${command} NAME'. See 'isp examples list' for names.\n`);
    return 2;
  }
  if (command === 'path') {
    process.stdout.write(`${example.path}\n`);
    return 0;
  }
  if (example.kind !== 'extension') return runScript(example, args);

  const extensionArgs = ['--extension', example.path];
  if (name === 'subagent') {
    const directory = fileURLToPath(new URL('../subagent/prompts/', import.meta.url));
    for (const prompt of ['scout-and-plan', 'implement', 'implement-and-review']) {
      extensionArgs.push('--prompt-template', join(directory, `${prompt}.md`));
    }
  }
  const { runPiCli } = await import('./run-pi-cli.js');
  return runPiCli([...extensionArgs, ...args]);
}
