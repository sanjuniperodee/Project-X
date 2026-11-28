#!/usr/bin/env bash
# Builds a self-contained release archive: bundled services (single JS file each) + Next.js standalone frontend.
# The server only unpacks it (deploy/deploy.sh); nothing is built or npm-installed there.
#   bash deploy/build-release.sh            → dist/release/px-<sha>.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
SHA=$(git rev-parse --short HEAD)
OUT=$ROOT/dist/release
STAGE=$OUT/px-$SHA
SERVICES=(catalog gateway projects payments media ai sales layout voice)

rm -rf "$STAGE" && mkdir -p "$STAGE/services"

for p in shared/contracts shared/service-kit; do
  (cd "$p" && npm ci --no-audit --no-fund --loglevel=error)
done

for s in "${SERVICES[@]}"; do
  echo "→ services/$s"
  (cd "services/$s" && npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null)
  mkdir -p "$STAGE/services/$s"
  cp -R "services/$s/dist" "$STAGE/services/$s/dist"
  [ -d "services/$s/drizzle" ] && cp -R "services/$s/drizzle" "$STAGE/services/$s/drizzle"
done

echo "→ frontend"
(cd frontend && npm ci --no-audit --no-fund --loglevel=error && NEXT_TELEMETRY_DISABLED=1 npm run build >/dev/null)
mkdir -p "$STAGE/frontend"
cp -R frontend/.next/standalone/. "$STAGE/frontend/"
mkdir -p "$STAGE/frontend/frontend/.next"
cp -R frontend/.next/static "$STAGE/frontend/frontend/.next/static"
[ -d frontend/public ] && cp -R frontend/public "$STAGE/frontend/frontend/public" || true
# The app does not use next/image, so the traced sharp binaries (built for this machine's platform) are dropped:
# the release stays plain JavaScript and runs on the linux-x64 server whatever machine built it.
find "$STAGE/frontend" -type d \( -path '*/node_modules/@img' -o -path '*/node_modules/sharp' \) -prune -exec rm -rf {} +
if find "$STAGE" -name '*.node' | grep -q .; then echo "native addons in the release:"; find "$STAGE" -name '*.node'; exit 1; fi

cp deploy/ecosystem.config.cjs "$STAGE/"
mkdir -p "$STAGE/deploy" && cp deploy/sidecars.sh deploy/kaspi-localhost.cjs deploy/backup.sh "$STAGE/deploy/"
echo "$SHA" > "$STAGE/REVISION"

COPYFILE_DISABLE=1 tar --no-xattrs -C "$OUT" -czf "$OUT/px-$SHA.tar.gz" "px-$SHA"
rm -rf "$STAGE"
echo "$OUT/px-$SHA.tar.gz"
