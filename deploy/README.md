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
| px-catalog / px-projects / px-payments / px-media / px-ai | 127.0.0.1:3072…3076 |
| px-nats | 127.0.0.1:4232, monitoring 127.0.0.1:8232 |

- Postgres: system cluster, role `px` (CONNECTION LIMIT 25), databases `px_projects`, `px_payments`.
- nginx: `/etc/nginx/sites-available/px` (`deploy/nginx.conf` + certbot, certificate `px`). It overwrites
  `X-Forwarded-For` with the real client address and rate-limits `/api` in front of the gateway's own limit.

## Integrations borrowed from MyBooks

- **Kaspi Pay**: the shared `kaspi-pos` sidecar (127.0.0.1:3032) with the MyBooks cashier session (`KASPI_*`).
  Money goes to the same Kaspi cashier as MyBooks. `~/kaspi-pos/webhooks.json` has an entry for
  `http://127.0.0.1:3074/webhooks/kaspi` with our own secret (`KASPI_WEBHOOK_SECRET`); notifications about
  MyBooks / my-test payments are ignored. Every 30 s pending payments are re-checked with Kaspi in case a webhook is lost.
  If kaspi-pos answers 401, the cashier session expired: re-login in MyBooks, then copy the new `KASPI_*` into `~/px/.env`.
- **Claude**: the Anthropic key from MyBooks settings (`AI_GENERATOR=claude`).
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
