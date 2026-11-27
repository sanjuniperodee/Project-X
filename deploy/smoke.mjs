#!/usr/bin/env node
// End-to-end smoke test of the order path through the public site (frontend /api passthrough):
// create → questionnaire → mock deposit → invite contribution → submit to designer → AI draft → /admin.
//   node deploy/smoke.mjs http://localhost:3000 [product] [--no-pay]
// --no-pay: for a site on a real provider (Kaspi bills a real phone): stops before checkout, so no submit / draft.
// Admin check needs ADMIN_USER / ADMIN_PASSWORD in the environment (skipped otherwise).
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const NO_PAY = process.argv.includes('--no-pay');
const BASE = (args[0] ?? 'http://localhost:3000').replace(/\/$/, '');
const PRODUCT = args[1] ?? 'glossy';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let step = 0;
const log = (msg) => console.log(`${String(++step).padStart(2)}. ${msg}`);

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return json;
}

async function page(path, init) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', ...init });
  if (res.status !== 200) throw new Error(`GET ${path} → ${res.status}`);
  return res;
}

async function upload() {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'smoke.png');
  const res = await fetch(`${BASE}/api/media/uploads`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload → ${res.status} ${await res.text()}`);
  const media = await res.json();
  // Read it back: proves the storage driver (disk or S3) round-trips the bytes.
  const back = await fetch(new URL(media.url, BASE));
  const bytes = Buffer.from(await back.arrayBuffer());
  if (!back.ok || !bytes.equals(PNG)) throw new Error(`uploaded file ${media.url} → ${back.status}, ${bytes.length} bytes`);
  return media;
}

async function value(field) {
  switch (field.type) {
    case 'text':
      return 'Смоук-тест';
    case 'textarea':
      return 'Как мы ездили на Чарын и потерялись, а потом нашли самое красивое место.';
    case 'date':
      return '1995-05-17';
    case 'select':
      return field.options[0].value;
    case 'choice':
      return field.multiple ? [field.options[0].value] : field.options[0].value;
    case 'photos': {
      const count = Math.max(field.min ?? 0, field.required ? 1 : 0);
      const out = [];
      for (let i = 0; i < count; i++) {
        const m = await upload();
        out.push({ id: m.id, url: m.url });
      }
      return out;
    }
    case 'list': {
      const count = Math.max(field.min ?? 0, 1);
      const items = [];
      for (let i = 0; i < count; i++) items.push(await answersFor(field.fields));
      return items;
    }
    default:
      throw new Error(`unknown field type ${field.type}`);
  }
}

async function answersFor(fields) {
  const out = {};
  for (const f of fields) out[f.id] = await value(f);
  return out;
}

async function waitFor(what, fn, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const product = await api('GET', `/catalog/products/${PRODUCT}`);
await page(`/${PRODUCT}`);
await page(`/${PRODUCT}/create`);
log(`landing and create pages of ${product.name} render`);

const created = await api('POST', '/projects', {
  productId: PRODUCT,
  subject: 'Смоук Тестович',
  selection: { formatId: product.formats[0].id, extras: {} },
  customer: { name: 'Смоук', phone: '+7 701 000 00 00' },
});
const { editKey, inviteKey } = created;
await page(`/${PRODUCT}/p/${editKey}`);
log(`project created (${created.id}), workspace renders`);

for (const s of product.steps.filter((s) => s.audience === 'owner')) {
  await api('PUT', `/projects/${editKey}/steps/${s.id}`, { answers: await answersFor(s.fields) });
}
log('owner questionnaire saved (photos uploaded through /api/media)');

const contributorSteps = product.steps.filter((s) => s.audience === 'contributor');
if (product.collaboration?.enabled && contributorSteps.length) {
  await page(`/${PRODUCT}/invite/${inviteKey}`);
  const answers = {};
  for (const s of contributorSteps) answers[s.id] = await answersFor(s.fields);
  await api('POST', `/invites/${inviteKey}/contributions`, { authorName: 'Друг Смоука', answers });
  log('invite page renders, contribution accepted');
}

if (NO_PAY) {
  log('payment, submit and AI draft skipped (--no-pay)');
} else {
  const checkout = await api('POST', `/projects/${editKey}/checkout`, { kind: 'deposit' });
  const payPath = new URL(checkout.redirectUrl, BASE).pathname;
  await page(payPath);
  await api('POST', `/payments/${checkout.paymentId}/mock/confirm`, { outcome: 'success' });
  await waitFor('deposit_paid', async () => (await api('GET', `/projects/${editKey}`)).status === 'deposit_paid');
  log(`mock deposit paid via ${payPath}, status deposit_paid`);

  const submitted = await api('POST', `/projects/${editKey}/submit`);
  log(`sent to designer, status ${submitted.status}`);

  const draft = await waitFor('AI draft', async () => (await api('GET', `/projects/${editKey}`)).draft);
  log(`AI draft received: "${draft.title}" (${draft.sections?.length ?? 0} sections)`);

}

if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
  const auth = 'Basic ' + Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASSWORD}`).toString('base64');
  const denied = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  if (denied.status !== 401) throw new Error(`/admin without auth → ${denied.status}, expected 401`);
  const html = await (await page('/admin', { headers: { authorization: auth } })).text();
  if (!html.includes('Смоук')) throw new Error('/admin list does not show the new order');
  await page(`/admin/${created.id}`, { headers: { authorization: auth } });
  log('/admin: 401 without auth, order visible in list and on its page');
}

console.log(`OK ${BASE}/${PRODUCT}/p/${editKey}`);
