#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "$(git branch --show-current)" != main || -n "$(git status --porcelain)" ]]; then
  echo 'Use a clean main checkout to propose an upstream sync.' >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo 'Sign in to GitHub CLI before proposing a sync.' >&2
  exit 1
fi

git fetch origin main
git fetch upstream main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo 'Local main differs from the fork. Update/review it before syncing.' >&2
  exit 1
fi

if git merge-base --is-ancestor upstream/main HEAD; then
  echo 'The fork already contains upstream/main.'
  exit 0
fi

if [[ "$(gh pr list --repo jaybpierce/goose --base main --state open --json headRefName --jq '[.[].headRefName | select(startswith("sync/upstream-"))] | length')" != 0 ]]; then
  echo 'An upstream sync PR is already open; review it before making another.' >&2
  exit 1
fi

branch="sync/upstream-$(git rev-parse --short=12 upstream/main)"
if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  echo "A previous attempt exists: $branch. Inspect it before retrying." >&2
  exit 1
fi

git switch -c "$branch"
if ! git -c merge.gpgsign=false merge --no-ff --no-edit upstream/main; then
  git diff --name-only --diff-filter=U >&2 || true
  git merge --abort
  git switch main
  git branch -d "$branch"
  echo 'Upstream conflicts require manual resolution; main was not changed.' >&2
  exit 1
fi

git push -u origin "$branch"
pr_url="$(gh pr create --repo jaybpierce/goose --base main --head "$branch" --title "Sync upstream main ($(git rev-parse --short upstream/main))" --body 'Merge upstream into the personal fork. Review diffs and CI; resolve conflicts without dropping Desktop customizations. After merging, rebuild and stage the personal app using scripts/personal-desktop.sh before replacing the installed version.')"
echo "$pr_url"
git switch main
