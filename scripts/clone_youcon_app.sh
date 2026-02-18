#!/usr/bin/env bash
set -euo pipefail

# Clone a repository into the current workspace.
# Usage:
#   ./scripts/clone_youcon_app.sh <repo_url> [target_dir]

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <repo_url> [target_dir]" >&2
  exit 1
fi

REPO_URL="$1"
TARGET_DIR="${2:-youcon-app}"

if [[ -e "$TARGET_DIR" ]]; then
  echo "Target directory '$TARGET_DIR' already exists. Choose a new directory name." >&2
  exit 1
fi

echo "Cloning $REPO_URL into $TARGET_DIR ..."
git clone "$REPO_URL" "$TARGET_DIR"
echo "Done."
