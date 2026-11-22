import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkEntry = import.meta.resolve('@earendil-works/pi-coding-agent');
const examplesDirectory = fileURLToPath(new URL('../examples/', sdkEntry));
const adaptedExtensionPaths = new Map([
  ['subagent', '../subagent/index.ts'],
  ['truncated-tool', './truncated-tool.ts'],
  ['ssh', './ssh.ts'],
]);

function extensionEntry(name, originalPath) {
  const adapted = adaptedExtensionPaths.get(name);
  const path = adapted ? fileURLToPath(new URL(adapted, import.meta.url)) : originalPath;
  return { name, kind: 'extension', path };
}

export function listExamples() {
  const extensionsDirectory = join(examplesDirectory, 'extensions');
  const extensions = readdirSync(extensionsDirectory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      return [extensionEntry(basename(entry.name, '.ts'), join(extensionsDirectory, entry.name))];
    }
    const directory = join(extensionsDirectory, entry.name);
    if (!entry.isDirectory() || !existsSync(join(directory, 'index.ts'))) return [];
    return [extensionEntry(entry.name, join(directory, 'index.ts'))];
  });
  const sdkDirectory = join(examplesDirectory, 'sdk');
  const sdk = readdirSync(sdkDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => ({ name: basename(entry.name, '.ts'), kind: 'sdk', path: join(sdkDirectory, entry.name) }));
  const rpc = ['rpc-client', 'rpc-extension-ui'].map(name => ({
    name, kind: 'rpc', path: fileURLToPath(new URL(`./${name}.ts`, import.meta.url)),
  }));
  return [extensions, sdk, rpc].flatMap(group => group.sort((a, b) => a.name.localeCompare(b.name)));
}
