# Deploy: shared server, next to MyBooks and DoseWear

Project X runs on the PS Cloud server **185.102.75.191** under user **srv** with PM2, like MyBooks and DoseWear.
No Docker there (srv is not in the docker group) and nothing is built on the server: a release is built
elsewhere and only unpacked.

| Host | What |
|---|---|
| https://px.185.102.75.191.sslip.io | studio hub, `/admin` (Basic Auth, `ADMIN_USER` / `ADMIN_PASSWORD` in `~/px/.env`) |
| https://coverme.185.102.75.191.sslip.io | Cover Me (`glossy`) |
| https://shezhire.185.102.75.191.sslip.io | Шежіре (`shezhire`) |
| https://mygame.185.102.75.191.sslip.io | MyGame (`boardgame`) |

## Layout on the server

- `~/px/.env` (600): all settings and secrets. Never in git or chats.
- `~/px/releases/<time>-<sha>` + `~/px/current`; `~/px/ecosystem.config.cjs` (copy of `deploy/ecosystem.config.cjs`).
- `~/px/nats/nats-server` (v2.11.6, official release, sha256-checked) with JetStream data in `~/px/nats/data`.
- `~/px/backups`: nightly `pg_dump` of both databases (cron 03:30 UTC, `deploy/backup.sh`, 14 days).
- Photos: S3 bucket of MyBooks (`S3_BUCKET`), prefix `px/uploads/`.

| PM2 app | Port (loopback only) |
|---|---|
| px-frontend | [::1]:3070 (Next with `HOSTNAME=localhost`, needed for brand-domain rewrites) |
| px-gateway | 127.0.0.1:3071 |
| px-catalog / px-projects / px-payments / px-media / px-ai / px-sales / px-layout / px-voice | 127.0.0.1:3072…3079 |
| px-kaspi-pos / px-gowa | 127.0.0.1:3082 / 3083 (`deploy/sidecars.sh`) |
| px-nats | 127.0.0.1:4232, monitoring 127.0.0.1:8232 |

- Postgres: system cluster, role `px` (CONNECTION LIMIT 25), databases `px_projects`, `px_payments`, `px_sales`.
- nginx: `/etc/nginx/sites-available/px` (`deploy/nginx.conf` + certbot, certificate `px`). It overwrites
  `X-Forwarded-For` with the real client address and rate-limits `/api` in front of the gateway's own limit.

## Integrations

- **Kaspi Pay — own cashier.** Own `kaspi-pos` instance (`~/px/sidecars/kaspi-pos`, 127.0.0.1:3082, PM2 `px-kaspi-pos`),
  installed by `deploy/sidecars.sh kaspi`. The cashier is connected in `/admin/integrations` (phone → SMS code); the
  session is stored encrypted in `px_payments.settings` (`SETTINGS_SECRET`). Expired session → connect again there.
  Webhooks of this kaspi-pos go only to `http://127.0.0.1:3074/webhooks/kaspi`; pending payments are also re-checked every 30 s.
  The shared kaspi-pos of MyBooks / my-test (3032) is not used.
- **WhatsApp — own number.** Own GOWA (`~/px/sidecars/gowa`, 127.0.0.1:3083, PM2 `px-gowa`, `deploy/sidecars.sh whatsapp`),
  device `px`, webhook → `px-sales` (`/webhooks/whatsapp`, signed). The number is linked by QR in `/admin/integrations`.
- **AI seller** (`px-sales`, 127.0.0.1:3077, DB `px_sales`): Claude answers customers in WhatsApp, creates orders and bills
  the Kaspi deposit / balance; customers get a message on every status change. Chats, hand-offs and studio replies:
  `/admin/chats`; a trial dialog without real orders: `/admin/integrations`. `STUDIO_PHONE` in `~/px/.env` gets hand-off
  and payment alerts. `BOT_ENABLED=false` keeps notifications but stops bot replies.
- **Voice studio** (`px-voice`, 127.0.0.1:3079): `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in `~/px/.env` switch on the live agent;
  without them the studio runs on the browser's speech. Create or update the agent from the repo: `services/voice/README.md`.
- **Claude**: the Anthropic key from MyBooks settings (`ANTHROPIC_API_KEY`, used by `px-ai` and `px-sales`).
- **S3**: MyBooks' PS Cloud Object Storage keys, separate prefix `px/`.

## Release

```bash
DEPLOY_SSH_OPTS="-i ~/.ssh/id_ed25519" bash deploy/ship.sh   # build → upload → deploy.sh on the server
```

`deploy/deploy.sh` unpacks, switches `current`, `pm2 startOrReload`, waits for `/ready` of every service
(Postgres, NATS, S3 checks) and the frontend, rolls back to the previous release on failure, keeps 5 releases.

Check after a release (prod has a real payment provider, so the payment part is skipped):

```bash
ssh srv@185.102.75.191 'set -a; . ~/px/.env; set +a; node ~/px/incoming/smoke.mjs https://px.185.102.75.191.sslip.io glossy --no-pay'
```

Logs: `pm2 logs px-payments --nostream --lines 200`. Rollback: `ln -sfn <older release> ~/px/current && pm2 restart ~/px/ecosystem.config.cjs`.
