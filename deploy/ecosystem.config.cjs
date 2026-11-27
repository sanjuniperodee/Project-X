// PM2 apps of Project X on the shared server (user srv, next to MyBooks and DoseWear).
// Runs the release under ~/px/current; secrets come from ~/px/.env (mode 600, never in git).
// Every port listens on loopback only (127.0.0.1, the frontend on [::1]): nginx is the single public entry (see deploy/nginx.conf).
const fs = require('node:fs');
const path = require('node:path');

const HOME = process.env.HOME;
const ROOT = path.join(HOME, 'px');
const CURRENT = path.join(ROOT, 'current');

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
const e = readEnv(path.join(ROOT, '.env'));

const PORTS = { frontend: 3070, gateway: 3071, catalog: 3072, projects: 3073, payments: 3074, media: 3075, ai: 3076 };
const NATS_URL = 'nats://127.0.0.1:4232';
const url = (svc) => `http://127.0.0.1:${PORTS[svc]}`;
const PG = (db) => `postgres://px:${encodeURIComponent(e.POSTGRES_PASSWORD)}@127.0.0.1:5432/${db}`;

const common = {
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  LOG_LEVEL: e.LOG_LEVEL || 'info',
  NATS_URL,
  CATALOG_URL: url('catalog'),
  PAYMENTS_URL: url('payments'),
  FRONTEND_URL: e.FRONTEND_URL,
};

function service(name, env = {}) {
  return {
    name: `px-${name}`,
    cwd: path.join(CURRENT, 'services', name),
    script: 'dist/main.js',
    node_args: '--enable-source-maps',
    env: { ...common, PORT: PORTS[name], ...env },
    max_memory_restart: '300M',
    kill_timeout: 10000,
    time: true,
  };
}

module.exports = {
  apps: [
    {
      name: 'px-nats',
      cwd: path.join(ROOT, 'nats'),
      script: path.join(ROOT, 'nats', 'nats-server'),
      args: '-js -sd ./data -a 127.0.0.1 -p 4232 -m 8232 -n px-nats',
      interpreter: 'none',
      max_memory_restart: '300M',
    },
    service('catalog'),
    service('projects', { DATABASE_URL: PG('px_projects'), PRODUCT_URLS: e.PRODUCT_URLS || '' }),
    service('payments', {
      DATABASE_URL: PG('px_payments'),
      PAYMENT_PROVIDER: e.PAYMENT_PROVIDER || 'mock',
      // Shared kaspi-pos sidecar and cashier session of MyBooks; webhooks.json there has an entry for us.
      KASPI_API_URL: e.KASPI_API_URL || 'http://127.0.0.1:3032',
      KASPI_TOKEN_SN: e.KASPI_TOKEN_SN || '',
      KASPI_VTOKEN_SECRET: e.KASPI_VTOKEN_SECRET || '',
      KASPI_PROFILE_ID: e.KASPI_PROFILE_ID || '0',
      KASPI_WEBHOOK_SECRET: e.KASPI_WEBHOOK_SECRET || '',
    }),
    service('media', {
      STORAGE_DRIVER: e.STORAGE_DRIVER || 'local',
      STORAGE_DIR: path.join(ROOT, 'media'),
      PUBLIC_PATH: '/api/media',
      S3_ENDPOINT: e.S3_ENDPOINT || 'https://object.pscloud.io',
      S3_REGION: e.S3_REGION || 'us-east-1',
      S3_BUCKET: e.S3_BUCKET || '',
      S3_PREFIX: e.S3_PREFIX || 'px/',
      S3_ACCESS_KEY_ID: e.S3_ACCESS_KEY_ID || '',
      S3_SECRET_ACCESS_KEY: e.S3_SECRET_ACCESS_KEY || '',
    }),
    service('ai', {
      AI_GENERATOR: e.AI_GENERATOR || 'template',
      ANTHROPIC_API_KEY: e.ANTHROPIC_API_KEY || '',
      AI_MODEL: e.AI_MODEL || 'claude-opus-5-5',
    }),
    service('gateway', {
      PROJECTS_URL: url('projects'),
      MEDIA_URL: url('media'),
      CORS_ORIGINS: e.CORS_ORIGINS || e.FRONTEND_URL,
      ADMIN_TOKEN: e.ADMIN_TOKEN,
      // Only the frontend (same host) talks to the gateway; nginx overwrites X-Forwarded-For with the real client IP.
      TRUST_PROXY: 'true',
      RATE_LIMIT_PER_MINUTE: e.RATE_LIMIT_PER_MINUTE || '300',
    }),
    {
      name: 'px-frontend',
      cwd: path.join(CURRENT, 'frontend'),
      script: 'frontend/server.js',
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: PORTS.frontend,
        // localhost (not 127.0.0.1): Next treats its brand-domain rewrites as internal only when they target its own
        // origin, which it names localhost. It then listens on [::1] only — nginx proxies there.
        HOSTNAME: 'localhost',
        API_URL: url('gateway'),
        FRONTEND_URL: e.FRONTEND_URL,
        BRAND_DOMAINS: e.BRAND_DOMAINS || '',
        ADMIN_TOKEN: e.ADMIN_TOKEN,
        ADMIN_USER: e.ADMIN_USER || 'studio',
        ADMIN_PASSWORD: e.ADMIN_PASSWORD,
      },
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
