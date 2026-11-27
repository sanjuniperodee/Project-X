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

const PORTS = { frontend: 3070, gateway: 3071, catalog: 3072, projects: 3073, payments: 3074, media: 3075, ai: 3076, sales: 3077 };
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

const SIDECARS = path.join(ROOT, 'sidecars');
// Own Kaspi cashier gateway and WhatsApp gateway of Project X (installed by deploy/sidecars.sh).
const sidecars = [
  fs.existsSync(path.join(SIDECARS, 'kaspi-pos', 'server.js')) && {
    name: 'px-kaspi-pos',
    cwd: path.join(SIDECARS, 'kaspi-pos'),
    script: 'server.js',
    node_args: '--require ./localhost.cjs',
    env: { NODE_ENV: 'production', TZ: 'Asia/Almaty' },
    max_memory_restart: '300M',
    time: true,
  },
  fs.existsSync(path.join(SIDECARS, 'gowa', 'whatsapp')) && {
    name: 'px-gowa',
    cwd: path.join(SIDECARS, 'gowa'),
    script: './whatsapp',
    args: 'rest',
    interpreter: 'none',
    max_memory_restart: '400M',
    time: true,
  },
].filter(Boolean);

module.exports = {
  apps: [
    ...sidecars,
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
      // Own kaspi-pos (deploy/sidecars.sh); the cashier is connected in /admin and stored encrypted (SETTINGS_SECRET).
      KASPI_API_URL: e.KASPI_API_URL || 'http://127.0.0.1:3082',
      KASPI_TOKEN_SN: e.KASPI_TOKEN_SN || '',
      KASPI_VTOKEN_SECRET: e.KASPI_VTOKEN_SECRET || '',
      KASPI_PROFILE_ID: e.KASPI_PROFILE_ID || '0',
      KASPI_WEBHOOK_SECRET: e.KASPI_WEBHOOK_SECRET || '',
      SETTINGS_SECRET: e.SETTINGS_SECRET || '',
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
    service('sales', {
      DATABASE_URL: PG('px_sales'),
      PROJECTS_URL: url('projects'),
      PRODUCT_URLS: e.PRODUCT_URLS || '',
      // Own WhatsApp gateway (deploy/sidecars.sh); empty → WhatsApp off.
      GOWA_API_URL: e.GOWA_API_URL || '',
      GOWA_BASIC_AUTH: e.GOWA_BASIC_AUTH || '',
      GOWA_CALLBACK_URL: e.GOWA_CALLBACK_URL || '',
      GOWA_WEBHOOK_SECRET: e.GOWA_WEBHOOK_SECRET || '',
      ANTHROPIC_API_KEY: e.ANTHROPIC_API_KEY || '',
      SALES_MODEL: e.SALES_MODEL || 'claude-opus-5-5',
      SALES_EFFORT: e.SALES_EFFORT || 'medium',
      BOT_ENABLED: e.BOT_ENABLED || 'true',
      STUDIO_PHONE: e.STUDIO_PHONE || '',
    }),
    service('gateway', {
      PROJECTS_URL: url('projects'),
      MEDIA_URL: url('media'),
      SALES_URL: url('sales'),
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
