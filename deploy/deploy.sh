#!/usr/bin/env bash
# Runs ON THE SERVER (user srv): unpack a release, switch ~/px/current, reload PM2, check health, roll back on failure.
#   bash deploy.sh ~/px/incoming/px-<sha>.tar.gz
set -euo pipefail
ARCHIVE=${1:?usage: deploy.sh <release.tar.gz>}
ROOT=$HOME/px
RELEASES=$ROOT/releases
mkdir -p "$RELEASES" "$ROOT/media" "$ROOT/nats/data" "$ROOT/logs" "$ROOT/tmp/layout"
[ -f "$ROOT/.env" ] || { echo "missing $ROOT/.env"; exit 1; }
[ -x "$ROOT/nats/nats-server" ] || { echo "missing $ROOT/nats/nats-server (see deploy/README.md)"; exit 1; }

NAME=$(date +%Y%m%d-%H%M%S)-$(basename "$ARCHIVE" .tar.gz | sed 's/^px-//')
TMP=$(mktemp -d)
tar -C "$TMP" -xzf "$ARCHIVE"
mv "$TMP"/px-* "$RELEASES/$NAME"
rm -rf "$TMP"

PREV=$(readlink "$ROOT/current" 2>/dev/null || true)
ln -sfn "$RELEASES/$NAME" "$ROOT/current"
cp "$ROOT/current/ecosystem.config.cjs" "$ROOT/ecosystem.config.cjs"

reload() {
  # --update-env: pick up a changed .env. cwd points at ~/px/current, so restart resolves the new release.
  pm2 startOrReload "$ROOT/ecosystem.config.cjs" --update-env >/dev/null
}

healthy() {
  local ok=0
  for i in $(seq 1 30); do
    ok=1
    for port in 3071 3072 3073 3074 3075 3076 3077 3078 3079; do
      # /ready checks the service's dependencies (Postgres, NATS, S3), not just that the process is up.
      curl -fsS "http://127.0.0.1:$port/ready" >/dev/null 2>&1 || { ok=0; break; }
    done
    [ $ok = 1 ] && curl -fsS -o /dev/null "http://[::1]:3070/" && return 0
    sleep 2
  done
  return 1
}

reload
if healthy; then
  pm2 save >/dev/null
  echo "deployed $NAME"
  # keep the 5 newest releases
  ls -1dt "$RELEASES"/*/ | tail -n +6 | xargs -r rm -rf
  rm -f "$ARCHIVE"
else
  echo "health check failed for $NAME"
  pm2 status | grep px- || true
  if [ -n "$PREV" ]; then
    echo "rolling back to $PREV"
    ln -sfn "$PREV" "$ROOT/current"
    cp "$ROOT/current/ecosystem.config.cjs" "$ROOT/ecosystem.config.cjs"
    reload
  fi
  exit 1
fi
