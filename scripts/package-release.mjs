import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pkg from '../package.json' with { type: 'json' };

const { values } = parseArgs({ options: {
  package: { type: 'string' }, out: { type: 'string' },
} });
if (!values.package || !values.out) throw new Error('Use --package PATH --out DIR.');

const packagePath = resolve(values.package);
const outDir = resolve(values.out);
const windows = process.platform === 'win32';
const nodeName = windows ? 'node.exe' : 'node';
const tar = windows ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const target = `${windows ? 'windows' : process.platform}-${process.arch}`;
const archiveName = `isp-${target}.${windows ? 'zip' : 'tar.gz'}`;
const runtimeDirectory = dirname(process.execPath);
const license = [join(runtimeDirectory, 'LICENSE'), join(runtimeDirectory, '..', 'LICENSE')].find(existsSync);
if (!license) throw new Error('Use an installed Node.js distribution that contains its LICENSE.');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${basename(command)} failed with status ${result.status ?? result.signal}.`);
  return result.stdout.trim();
}

const shellLauncher = `#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
entry="$root/$(basename -- "$0")"
while [ -L "$entry" ]; do
  target=$(readlink "$entry")
  case "$target" in /*) entry="$target" ;; *) entry="$(dirname -- "$entry")/$target" ;; esac
done
root=$(CDPATH='' cd -- "$(dirname -- "$entry")" && pwd)
runtime="$root/../lib/runtime/bin"
PATH="$runtime:$PATH"
export PATH
exec "$runtime/node" "$root/../lib/package/bin/isp.js" "$@"
`;
const windowsLauncher = [
  '@echo off', 'setlocal DisableDelayedExpansion',
  'set "RUNTIME=%~dp0..\\lib\\runtime\\bin"', 'set "PATH=%RUNTIME%;%PATH%"',
  '"%RUNTIME%\\node.exe" "%~dp0..\\lib\\package\\bin\\isp.js" %*', '',
].join('\r\n');

const stage = await mkdtemp(join(tmpdir(), 'isp-release-'));
try {
  const bundle = join(stage, 'isp');
  const binDir = join(bundle, 'bin');
  const libDir = join(bundle, 'lib');
  const runtimeBin = join(libDir, 'runtime', 'bin');
  await mkdir(binDir, { recursive: true });
  await mkdir(runtimeBin, { recursive: true });
  run(tar, ['-xzf', packagePath, '-C', libDir]);
  const shippedPkg = JSON.parse(await readFile(join(libDir, 'package', 'package.json'), 'utf8'));
  if (shippedPkg.name !== pkg.name || shippedPkg.version !== pkg.version) {
    throw new Error(`The package must match ${pkg.name}@${pkg.version}.`);
  }
  const runtime = join(runtimeBin, nodeName);
  const launcher = join(binDir, windows ? 'isp.cmd' : 'isp');
  await copyFile(process.execPath, runtime);
  await copyFile(license, join(bundle, 'LICENSE-node.txt'));
  await writeFile(launcher, windows ? windowsLauncher : shellLauncher);
  if (!windows) {
    await chmod(runtime, 0o755);
    await chmod(launcher, 0o755);
  }
  const cli = join(libDir, 'package', 'bin', 'isp.js');
  const actualVersion = windows ? run(runtime, [cli, '--version']) : run(launcher, ['--version']);
  if (actualVersion !== pkg.version) throw new Error(`The packaged launcher reported version ${actualVersion}.`);

  await mkdir(outDir, { recursive: true });
  const archivePath = join(outDir, archiveName);
  const tarMode = windows ? '-acf' : '-czf';
  run(tar, [tarMode, archivePath, '-C', stage, 'isp']);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archivePath)) hash.update(chunk);
  await writeFile(`${archivePath}.sha256`, `${hash.digest('hex')}  ${archiveName}\n`);
  console.log(archivePath);
} finally {
  await rm(stage, { recursive: true, force: true });
}

