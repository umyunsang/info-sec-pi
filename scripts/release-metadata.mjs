import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const repo = process.env.GITHUB_REPOSITORY;
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Set GITHUB_REPOSITORY to OWNER/REPO.');
if (!process.argv[2]) throw new Error('Pass the release asset directory.');
const directory = resolve(process.argv[2]);
const homepage = `https://github.com/${repo}`;
const base = `${homepage}/releases/download/v${pkg.version}`;
const targets = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'windows-arm64', 'windows-x64'];
const digests = new Map();

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, file))) hash.update(chunk);
  return hash.digest('hex');
}

for (const target of targets) {
  const file = `isp-${target}.${target.startsWith('windows') ? 'zip' : 'tar.gz'}`;
  const sha = await sha256(file);
  const declared = (await readFile(join(directory, `${file}.sha256`), 'utf8')).trim();
  if (declared !== `${sha}  ${file}`) throw new Error(`SHA-256 verification failed for ${file}.`);
  digests.set(target, { file, sha });
}

function formulaPlatform(target, arch) {
  const { file, sha } = digests.get(target);
  return `    on_${arch} do\n      url "${base}/${file}"\n      sha256 "${sha}"\n    end`;
}

const formula = `class Isp < Formula
  desc "Terminal coding assistant with subagents"
  homepage "${homepage}"
  version "${pkg.version}"

  on_macos do
${formulaPlatform('darwin-arm64', 'arm')}
${formulaPlatform('darwin-x64', 'intel')}
  end

  on_linux do
${formulaPlatform('linux-arm64', 'arm')}
${formulaPlatform('linux-x64', 'intel')}
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/isp"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/isp --version").strip
  end
end
`;
await writeFile(join(directory, 'isp.rb'), formula);

const nixSystems = {
  'aarch64-darwin': 'darwin-arm64', 'x86_64-darwin': 'darwin-x64',
  'aarch64-linux': 'linux-arm64', 'x86_64-linux': 'linux-x64',
};
const nixAssets = Object.entries(nixSystems).map(([system, target]) => {
  const { file, sha } = digests.get(target);
  const hash = Buffer.from(sha, 'hex').toString('base64');
  return `        ${system} = { url = "${base}/${file}"; hash = "sha256-${hash}"; };`;
}).join('\n');
const flake = `{
  description = "isp ${pkg.version}";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { nixpkgs, ... }:
    let
      assets = {
${nixAssets}
      };
    in {
      packages = builtins.mapAttrs (system: asset:
        let
          pkgs = import nixpkgs { inherit system; };
          archive = pkgs.fetchurl asset;
        in {
          default = pkgs.runCommand "isp-${pkg.version}" { nativeBuildInputs = [ pkgs.makeWrapper ]; } ''
            mkdir -p "$out/bin" "$out/lib"
            tar -xzf \${archive} --strip-components=1 -C "$out" isp/lib isp/LICENSE-node.txt
            makeWrapper \${pkgs.nodejs_22}/bin/node "$out/bin/isp" --add-flags "$out/lib/package/bin/isp.js" --prefix PATH : \${pkgs.nodejs_22}/bin
          '';
        }) assets;
    };
}
`;
const staging = await mkdtemp(join(tmpdir(), 'isp-flake-'));
try {
  await writeFile(join(staging, 'flake.nix'), flake);
  execFileSync('tar', ['-czf', join(directory, 'isp-flake.tar.gz'), '-C', staging, 'flake.nix']);
} finally {
  await rm(staging, { recursive: true, force: true });
}

for (const file of ['install.sh', 'install.ps1']) {
  await copyFile(new URL(`./${file}`, import.meta.url), join(directory, file));
}
const files = (await readdir(directory)).filter(file => /\.(tar\.gz|zip|tgz|rb|sh|ps1)$/.test(file)).sort();
const sums = await Promise.all(files.map(async file => `${await sha256(file)}  ${file}`));
await writeFile(join(directory, 'SHA256SUMS'), `${sums.join('\n')}\n`);
