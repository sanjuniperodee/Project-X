#!/usr/bin/env bash
# Own sidecars of Project X on the shared server (PM2, no Docker), the same way DoseWear runs its own:
#   kaspi    — kaspi-pos-automation (MIT, github.com/tapter-dev/kaspi-pos-automation) on 127.0.0.1:3082. Project X has its
#              OWN instance and its OWN Kaspi Pay cashier: Kaspi keeps one session per cashier, and the shared kaspi-pos
#              (3032, MyBooks + my-test) is not used. The cashier is connected in /admin → «Интеграции».
#   whatsapp — GOWA, go-whatsapp-web-multidevice (MIT) on 127.0.0.1:3083: the studio's own WhatsApp number, linked by QR
#              in /admin → «Интеграции». The sales bot (px-sales) receives its webhooks.
# Run on the server: bash ~/px/current/deploy/sidecars.sh [kaspi] [whatsapp]   (no arguments — both)
# Secrets are created on first install; a re-run updates the pinned version and keeps sessions and keys.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${PX_ROOT:-$HOME/px}"
DIR="$ROOT/sidecars"
ENV="$ROOT/.env"
KASPI_PORT=3082
GOWA_PORT=3083
PAYMENTS_PORT=3074
SALES_PORT=3077
KASPI_POS_REF="175577ee1b34437dba46fb9bb0c8706f57f3b311"
GOWA_VERSION="9.6.0"
targets=("$@")
[ ${#targets[@]} -gt 0 ] || targets=(kaspi whatsapp)
has() { [[ " ${targets[*]} " == *" $1 "* ]]; }
secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(Number(process.argv[1])).toString("hex"))' "$1"; }
# Set KEY=value in ~/px/.env (replacing an existing line), mode 600.
setenv() { touch "$ENV" && chmod 600 "$ENV"; sed -i "/^$1=/d" "$ENV"; echo "$1=$2" >>"$ENV"; }
getenv() { grep "^$1=" "$ENV" 2>/dev/null | cut -d= -f2- || true; }
mkdir -p "$DIR"

if has kaspi; then
  echo "→ kaspi-pos-automation ($KASPI_POS_REF), port $KASPI_PORT"
  K="$DIR/kaspi-pos"
  [ -d "$K/.git" ] || git clone --quiet https://github.com/tapter-dev/kaspi-pos-automation.git "$K"
  git -C "$K" fetch --quiet origin
  git -C "$K" checkout --quiet "$KASPI_POS_REF"
  (cd "$K" && nice -n 19 npm ci --omit=dev --no-audit --no-fund --silent)
  # The session encryption key is created once: a new key invalidates the connected cashier.
  touch "$K/.env" && chmod 600 "$K/.env"
  grep -q '^TOKEN_SECRET_KEY=' "$K/.env" || echo "TOKEN_SECRET_KEY=$(secret 32)" >>"$K/.env"
  sed -i '/^PORT=/d' "$K/.env" && echo "PORT=$KASPI_PORT" >>"$K/.env"
  WEBHOOK_SECRET="$(getenv KASPI_WEBHOOK_SECRET)"
  [ -n "$WEBHOOK_SECRET" ] || { WEBHOOK_SECRET="$(secret 32)"; setenv KASPI_WEBHOOK_SECRET "$WEBHOOK_SECRET"; }
  printf '[{"url":"http://127.0.0.1:%s/webhooks/kaspi","events":["payment.success","payment.failed","payment.expired","payment.lost"],"secret":"%s"}]\n' "$PAYMENTS_PORT" "$WEBHOOK_SECRET" >"$K/webhooks.json"
  chmod 600 "$K/webhooks.json"
  # kaspi-pos cannot choose an address and has no auth of its own: bind it to 127.0.0.1.
  cp "$HERE/kaspi-localhost.cjs" "$K/localhost.cjs"
  setenv KASPI_API_URL "http://127.0.0.1:$KASPI_PORT"
  [ -n "$(getenv SETTINGS_SECRET)" ] || setenv SETTINGS_SECRET "$(secret 32)"
  # A session of another cashier (from another kaspi-pos) does not work here.
  sed -i -E '/^KASPI_(TOKEN_SN|VTOKEN_SECRET|PROFILE_ID)=/d' "$ENV"
fi

if has whatsapp; then
  echo "→ GOWA v$GOWA_VERSION, port $GOWA_PORT"
  G="$DIR/gowa"
  mkdir -p "$G"
  case "$(uname -m)" in x86_64 | amd64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) echo "GOWA: no build for $(uname -m)"; exit 1 ;; esac
  command -v unzip >/dev/null || { echo "unzip is required"; exit 1; }
  zip="whatsapp_${GOWA_VERSION}_linux_${arch}.zip"
  base="https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases/download/v${GOWA_VERSION}"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/$zip" "$base/$zip"
  curl -fsSL -o "$tmp/checksums.txt" "$base/checksums.txt"
  (cd "$tmp" && grep " $zip\$" checksums.txt | sha256sum -c --quiet -) || { echo "GOWA: checksum mismatch"; exit 1; }
  mkdir -p "$tmp/x" && unzip -q "$tmp/$zip" -d "$tmp/x"
  bin="$(find "$tmp/x" -type f -name 'linux-*' | head -n 1)"
  [ -n "$bin" ] || { echo "GOWA: no binary in the archive"; exit 1; }
  # The number's session lives in storages: copy it before replacing the binary (rollback without a new QR).
  if [ -d "$G/storages" ] && ! cmp -s "$bin" "$G/whatsapp"; then
    pm2 stop px-gowa >/dev/null 2>&1 || true
    tar -C "$G" -czf "$G/storages-$(date +%Y%m%d-%H%M%S).tgz" storages
    ls -1t "$G"/storages-*.tgz | tail -n +4 | xargs -r rm -f
  fi
  install -m 755 "$bin" "$G/whatsapp.new" && mv -f "$G/whatsapp.new" "$G/whatsapp"
  touch "$G/.env" && chmod 600 "$G/.env"
  grep -q '^APP_BASIC_AUTH=' "$G/.env" || echo "APP_BASIC_AUTH=px:$(secret 16)" >>"$G/.env"
  sed -i -E '/^(APP_PORT|APP_HOST|APP_OS|APP_UI_ENABLED|MCP_ENABLED|WHATSAPP_WEBHOOK_IGNORE_JIDS|WHATSAPP_AUTO_DOWNLOAD_MEDIA|WHATSAPP_IGNORE_STATUS_MEDIA|WHATSAPP_ACCOUNT_VALIDATION)=/d' "$G/.env"
  cat >>"$G/.env" <<EOT
APP_PORT=$GOWA_PORT
APP_HOST=127.0.0.1
APP_OS=Project X
APP_UI_ENABLED=false
MCP_ENABLED=false
WHATSAPP_WEBHOOK_IGNORE_JIDS=@g.us,@newsletter,@broadcast
WHATSAPP_AUTO_DOWNLOAD_MEDIA=false
WHATSAPP_IGNORE_STATUS_MEDIA=true
WHATSAPP_ACCOUNT_VALIDATION=false
EOT
  setenv GOWA_API_URL "http://127.0.0.1:$GOWA_PORT"
  setenv GOWA_BASIC_AUTH "$(grep '^APP_BASIC_AUTH=' "$G/.env" | cut -d= -f2-)"
  setenv GOWA_CALLBACK_URL "http://127.0.0.1:$SALES_PORT/webhooks/whatsapp"
  [ -n "$(getenv GOWA_WEBHOOK_SECRET)" ] || setenv GOWA_WEBHOOK_SECRET "$(secret 32)"
fi

# PM2 picks the sidecars up from ~/px/ecosystem.config.cjs (entries appear once their files exist).
pm2 startOrReload "$ROOT/ecosystem.config.cjs" --update-env >/dev/null
pm2 save >/dev/null
echo "✓ done. /admin → «Интеграции»: connect the Kaspi cashier (SMS) and link the WhatsApp number (QR)."
