import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { piSdk } from '../pi-sdk.js';

export async function runPiCli(args) {
  // The Pi entry point expects its own session-directory variable. Keep the
  // example and protocol sessions in the same store as the regular isp CLI.
  process.env.ISP_CODING_AGENT_SESSION_DIR = resolve(
    process.env.ISP_SESSION_DIR || join(homedir(), piSdk.CONFIG_DIR_NAME, 'sessions'),
  );
  const sdkEntry = import.meta.resolve('@earendil-works/pi-coding-agent');
  const { main } = await import(new URL('./main.js', sdkEntry));
  await main(args);
  return process.exitCode ?? 0;
}
