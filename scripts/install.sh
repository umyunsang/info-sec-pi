#!/bin/sh
set -eu

repo=${ISP_REPO:-umyunsang/info-sec-pi}
ref=
source_install=false
package=@info-sec-pi/isp

fail() { printf 'isp: %s\n' "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo|--ref)
      [ "$#" -ge 2 ] || fail "$1 requires a value."
      case "$1" in --repo) repo=$2 ;; --ref) ref=$2 ;; esac
      shift 2
      ;;
    --source) source_install=true; shift ;;
    --binary) source_install=false; shift ;;
    -h|--help)
      printf '%s\n' 'Usage: install.sh [--repo OWNER/REPO] [--ref vVERSION] [--binary|--source]'
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

if [ -n "$ref" ]; then
  printf '%s\n' "$ref" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$' || fail 'Use a release tag such as v0.3.0-alpha.4.'
fi
if [ "$source_install" = true ]; then
  command -v npm >/dev/null || fail 'The package install requires Node.js and npm.'
  if [ -n "$ref" ]; then package="$package@${ref#v}"; fi
  npm install --global "$package"
  exit 0
fi

printf '%s\n' "$repo" | grep -Eq '^[0-9A-Za-z_.-]+/[0-9A-Za-z_.-]+$' || fail 'Set ISP_REPO or pass --repo OWNER/REPO.'
case "$(uname -s)" in Darwin) platform=darwin ;; Linux) platform=linux ;; *) fail 'Use the PowerShell installer on Windows.' ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) fail 'Unsupported CPU architecture.' ;; esac

asset="isp-$platform-$arch.tar.gz"
base="https://github.com/$repo/releases/latest/download"
if [ -n "$ref" ]; then base="https://github.com/$repo/releases/download/$ref"; fi
install_dir=${ISP_INSTALL_DIR:-"$HOME/.local/bin"}
release_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}/isp/releases
mkdir -p "$install_dir" "$release_dir"
install_dir=$(CDPATH='' cd -- "$install_dir" && pwd)
release_dir=$(CDPATH='' cd -- "$release_dir" && pwd)

download=$(mktemp -d "${TMPDIR:-/tmp}/isp-download.XXXXXX")
staging=
link_dir=
cleanup() {
  rm -rf "$download"
  if [ -n "$staging" ]; then rm -rf "$staging"; fi
  if [ -n "$link_dir" ]; then rm -rf "$link_dir"; fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

curl -fsSL --proto '=https' --proto-redir '=https' "$base/$asset" -o "$download/$asset"
curl -fsSL --proto '=https' --proto-redir '=https' "$base/$asset.sha256" -o "$download/$asset.sha256"
expected=$(awk 'NR == 1 {print $1}' "$download/$asset.sha256")
printf '%s\n' "$expected" | grep -Eq '^[[:xdigit:]]{64}$' || fail 'The release checksum is invalid.'
if command -v sha256sum >/dev/null; then
  actual=$(sha256sum "$download/$asset" | awk '{print $1}')
elif command -v shasum >/dev/null; then
  actual=$(shasum -a 256 "$download/$asset" | awk '{print $1}')
else
  fail 'Install sha256sum or shasum to verify the download.'
fi
[ "$expected" = "$actual" ] || fail 'The downloaded archive failed SHA-256 verification.'

staging=$(mktemp -d "$release_dir/isp.XXXXXX")
tar -xzf "$download/$asset" -C "$staging"
launcher="$staging/isp/bin/isp"
[ -x "$launcher" ] || fail 'The release archive does not contain isp.'
version=$("$launcher" --version)
if [ -n "$ref" ] && [ "v$version" != "$ref" ]; then fail 'The installed version does not match the requested tag.'; fi

[ ! -d "$install_dir/isp" ] || fail "A directory already exists at $install_dir/isp."
link_dir=$(mktemp -d "$install_dir/.isp.XXXXXX")
ln -s "$launcher" "$link_dir/isp"
mv -f "$link_dir/isp" "$install_dir/isp"
staging=
printf 'Installed isp %s at %s/isp\n' "$version" "$install_dir"
case ":$PATH:" in *":$install_dir:"*) ;; *) printf 'Add %s to your PATH to run isp.\n' "$install_dir" ;; esac
