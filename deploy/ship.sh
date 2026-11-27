#!/usr/bin/env bash
# Build a release here (laptop or CI), upload it and run deploy/deploy.sh on the server.
#   DEPLOY_HOST=srv@185.102.75.191 bash deploy/ship.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${DEPLOY_HOST:-srv@185.102.75.191}
SSH_OPTS=(${DEPLOY_SSH_OPTS:-})

ARCHIVE=$(bash deploy/build-release.sh | tail -1)
ssh "${SSH_OPTS[@]}" "$HOST" 'mkdir -p ~/px/incoming'
scp "${SSH_OPTS[@]}" "$ARCHIVE" deploy/deploy.sh "$HOST:px/incoming/"
ssh "${SSH_OPTS[@]}" "$HOST" "bash ~/px/incoming/deploy.sh ~/px/incoming/$(basename "$ARCHIVE")"
