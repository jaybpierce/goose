#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "${1:-stage}" != 'stage' && "${1:-stage}" != 'install' ]]; then
  echo 'Usage: personal-desktop.sh [stage|install]' >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo 'This installer supports only arm64 macOS.' >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo 'Refusing to build from a dirty checkout. Commit or set aside changes first.' >&2
  exit 1
fi

# Avoid rebuilding or replacing a live app from a checkout with unreviewed upstream changes.
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo 'Switch to the reviewed personal main branch first.' >&2
  exit 1
fi

source bin/activate-hermit
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
staged_app="$repo_root/ui/desktop/out/personal-staged/Goose.app"
if [[ "${1:-stage}" == 'stage' ]]; then
  if [[ -e "$staged_app" ]]; then
    echo "Existing staged build: $staged_app. Move it aside before building another." >&2
    exit 1
  fi
  just release-binary
  (cd ui/desktop && pnpm install --frozen-lockfile && pnpm run typecheck && pnpm run package)
  source_app="$repo_root/ui/desktop/out/Goose-darwin-arm64/Goose.app"
  mkdir -p "$(dirname "$staged_app")"
  ditto "$source_app" "$staged_app"
  codesign --force --deep --sign - --entitlements ui/desktop/entitlements.plist "$staged_app"
fi

if [[ ! -d "$staged_app" ]]; then
  echo "No staged app at $staged_app. Stage it first." >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$staged_app"

if [[ "${1:-stage}" != 'install' ]]; then
  echo "Staged and verified: $staged_app"
  echo 'To install, run this script with install after reviewing the staged app.'
  exit 0
fi

installed_app="$HOME/Applications/Goose.app"
backup_dir="$HOME/Applications/Goose-backups"
mkdir -p "$backup_dir"
if pgrep -f -q "^$installed_app/Contents/MacOS/Goose$"; then
  echo 'The installed Goose app is running; quit it normally and retry. Nothing was replaced.' >&2
  exit 1
fi

if [[ -e "$installed_app" && ! -d "$installed_app" ]]; then
  echo "Refusing to replace non-directory: $installed_app" >&2
  exit 1
fi

if [[ -e "$installed_app" ]]; then
  backup="$backup_dir/Goose-$(date +%Y%m%d-%H%M%S).app"
  mv "$installed_app" "$backup"
  echo "Previous installation saved: $backup"
fi

if ! mv "$staged_app" "$installed_app"; then
  echo 'Install failed. Restore the saved app from Goose-backups manually.' >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$installed_app"
echo "Installed: $installed_app"
echo 'The app has an ad-hoc signature; macOS may require manual approval to open it.'
