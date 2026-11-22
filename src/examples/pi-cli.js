import { runPiCli } from './run-pi-cli.js';

try {
  process.exitCode = await runPiCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`isp: ${error.message}\n`);
  process.exitCode = 1;
}
