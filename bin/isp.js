#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { text } from 'node:stream/consumers';
import pkg from '../package.json' with { type: 'json' };

const help = `isp (info-sec-pi) ${pkg.version}

Usage
  isp                             Open an interactive coding session
  isp -p "prompt"                 Print the final answer and exit
  command | isp -p "instruction"  Send piped text with an optional instruction
  isp examples list               List official Pi examples
  isp examples run NAME           Run an official Pi example

Options
  -p, --print               Run once and write the answer to stdout
  -c, --continue            Continue the most recent isp session in this directory
      --session ID          Continue a specific isp session in this directory
      --session-dir DIR     Use a specific isp session directory
      --no-session          Keep this session in memory
      --model PROVIDER/ID   Select a model configured in isp
  -e, --extension PATH      Load a Pi extension with the Pi CLI options
      --mode json|rpc       Stream JSON events or accept RPC commands on stdin
  -h, --help                Show help
  -v, --version             Show the isp version

In the interactive terminal, use /login to connect a provider and /model to select a model.
`;

function usageError(message) {
  process.stderr.write(`isp: ${message}\nSee isp --help for usage.\n`);
  return 2;
}

async function run(argv) {
  if (argv[0] === 'examples') {
    const { runExamples } = await import('../src/examples/command.js');
    return runExamples(argv.slice(1));
  }
  for (const arg of argv) {
    if (arg === '--') break;
    if (arg === '--mode' || arg === '--extension' || arg === '-e') {
      const { runPiCli } = await import('../src/examples/run-pi-cli.js');
      return runPiCli(argv);
    }
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        print: { type: 'boolean', short: 'p' },
        continue: { type: 'boolean', short: 'c' },
        session: { type: 'string' },
        'session-dir': { type: 'string' },
        'no-session': { type: 'boolean' },
        model: { type: 'string' },
      },
    });
  } catch (error) {
    return usageError(error.message);
  }

  const { values, positionals } = parsed;
  if (values.help || values.version) {
    process.stdout.write(values.help ? help : `${pkg.version}\n`);
    return 0;
  }
  const sessionId = values.session?.trim();
  const sessionDirectory = values['session-dir'];
  if (sessionId === '' || sessionDirectory?.trim() === '') {
    return usageError('--session and --session-dir require non-empty values.');
  }
  if ([values.continue, sessionId, values['no-session']].filter(Boolean).length > 1) {
    return usageError('Choose one of --continue, --session and --no-session.');
  }
  if (values.model !== undefined && !/^[^/\s]+\/[^\s]+$/.test(values.model)) {
    return usageError('--model expects PROVIDER/ID.');
  }

  const interactive = !values.print && process.stdin.isTTY && process.stdout.isTTY;
  const instruction = positionals.join(' ');
  const piped = process.stdin.isTTY ? '' : await text(process.stdin);
  const prompt = [instruction, piped].filter(part => part.trim().length > 0).join('\n\n');
  if (!interactive && !prompt) {
    return usageError('Pass a prompt or pipe text to stdin.');
  }

  const { runSession } = await import('../src/session.js');
  return runSession({
    interactive: Boolean(interactive),
    prompt,
    modelSelector: values.model,
    continueSession: values.continue,
    sessionId,
    sessionDirectory,
    inMemory: values['no-session'],
  });
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`isp: ${error.message ?? String(error)}\n`);
  process.exitCode = 1;
}
