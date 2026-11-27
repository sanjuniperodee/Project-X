# Frontend

Next.js 16 (App Router), React 19, Tailwind CSS 4. One site serves three brands and the studio hub:

| Brand    | Product id  | Path (dev)   | Domain (prod) |
| -------- | ----------- | ------------ | ------------- |
| Cover Me | `glossy`    | `/glossy`    | coverme.kz    |
| Шежіре   | `shezhire`  | `/shezhire`  | shezhire.kz   |
| MyGame   | `boardgame` | `/boardgame` | mygame.kz     |

The frontend talks only to the API gateway. Business data (formats, prices, questionnaires)
comes from the catalog service; how a brand looks and speaks lives here.

## Run

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000 (needs the gateway at API_URL)
npm run typecheck && npm run lint && npm run build
```

`/admin` (studio back-office) asks for `ADMIN_USER` / `ADMIN_PASSWORD`.

## Structure

```
src/
  proxy.ts                 brand domains → /[brand] rewrite, Basic Auth for /admin
  app/                     routes only, thin
    page.tsx               studio hub
    [brand]/               landing, /create, /p/[editKey] workspace, /invite/[inviteKey]
    pay/mock/[paymentId]   test checkout page of the mock payment provider
    admin/                 studio CRM: dashboard, orders, customers, chats, settings
    api/[...path]/route.ts same-origin passthrough to the gateway (streams uploads)
  brands/                  per-brand presentation
    types.ts               BrandDefinition: logo, landing, chrome, copy
    index.ts               registry ProductId → brand
    glossy/ shezhire/ boardgame/
  features/                UI by feature
    hub/ brand-shell/ create-project/ questionnaire/ workspace/ invite/ checkout/ admin/
  shared/
    api/                   core (fetch + contract validation + ApiError), server client, browser client
    config/                env (zod, server-only), site constants
    lib/                   brand routing, small helpers
    ui/                    design-system primitives and fonts
```

### Data flow

- **Reads** happen in server components through `shared/api/server.ts` (gateway URL from `API_URL`).
  Every response is parsed with the shared `@px/contracts` schemas.
- **Customer writes** (create project, autosave answers, checkout, contribute, upload) go from the
  browser to same-origin `/api/*` via `shared/api/browser.ts`.
- **Studio writes** use server actions (`features/admin/actions.ts`), so `ADMIN_TOKEN` never reaches the browser.
  `/api/admin/*` is blocked in the passthrough.

### Studio CRM (`/admin`)

| Route                       | What the team does there                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `/admin`                    | queues that need action today, month revenue, funnel, upcoming event dates  |
| `/admin/orders`             | table or board by status; filters by status, product, design mode, search   |
| `/admin/orders/[id]`        | answers, materials, layouts, payments, status change, team notes, history   |
| `/admin/customers`          | customers grouped by phone: orders, revenue, last activity                  |
| `/admin/chats`, `/settings` | sales chats (human handoff) and the Kaspi Pay cashier                       |

Filters live in the URL (`?status=paid,printing&sort=deadline`), so every queue on the dashboard is
a plain link and any view can be bookmarked. Code lives in `features/admin/`: `lib/` (status labels,
formatting, query parsing), `ui/` (table, panel, badges: neutral, dense, no brand styling), then one
folder per screen. The admin area has its own tokens under `[data-area='admin']` in `globals.css`.
Numbers come from `GET /api/admin/stats` and `/api/admin/customers` (SQL aggregates in the projects
service, `infrastructure/back-office-queries.ts`). Month revenue counts payments of orders created that month.

### Questionnaires

Forms are not hand-written. `features/questionnaire` renders any `WizardStep` from the catalog
(text, textarea, date, select, choice, photos, repeatable lists) and validates it with the same
`validateStep` the projects service uses. Owners' steps autosave in draft mode; submit checks
required fields. Change a question in `services/catalog/src/products/*.ts` and the form follows.

### Brand theming

`app/globals.css` maps semantic tokens (`bg-surface`, `text-ink`, `bg-accent`, `rounded-control`, `font-display`…)
to CSS variables, re-defined per `[data-brand]`. Shared components only use semantic tokens, so the
workspace, forms and invite page wear each brand without brand-specific code.

### Brand domains

Set `BRAND_DOMAINS=coverme.kz=glossy,…`. On a brand domain the proxy rewrites `/create` → `/glossy/create`,
redirects `/glossy/create` → `/create`, and sets a header that makes `getBrandLinks()` / `useBrand().href()`
omit the prefix. Always build links inside a brand with those helpers, never with a hard-coded `/glossy`.

## Add a brand

1. Add the product to `ProductId` in `shared/contracts/src/products.ts` and define it in `services/catalog/src/products/`.
2. Create `src/brands/<id>/` with `index.tsx` (a `BrandDefinition`: logo, chrome classes, copy) and its landing.
3. Register it in `src/brands/index.ts` and add a `[data-brand='<id>']` token block in `app/globals.css`
   (plus fonts in `shared/ui/fonts.ts` if needed). TypeScript will point out anything missing,
   e.g. the hub's preview panel.

## Пример номера Cover Me на лендинге

`public/coverme/issue/*.webp` — настоящие страницы номера на 24 страницы. Их свёрстал layout-сервис
(шаблон `glossy-magazine@2`) по демо-анкете и растеризовал из печатного PDF без вылетов под обрез.
Список рубрик — в `src/brands/glossy/sample-issue.ts`. После изменения шаблона страницы нужно перегенерировать:
собрать демо-номер через `LayoutService.render` (см. `services/layout/scripts/sample.ts`), затем
`pdftoppm -r 110 -png layout.pdf r` и обрезать по 13 px с каждой стороны.
Фото в демо-номере и `public/coverme/cover-portrait.jpg` взяты с Unsplash (Unsplash License).
