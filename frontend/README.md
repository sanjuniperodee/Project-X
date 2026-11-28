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

## Голосовая студия (`src/features/voice-studio/`)

`/[brand]/p/[editKey]/voice` — анкета как разговор. После создания заказа клиент попадает сюда (в анкету ведёт кнопка
«Заполнить анкету самому», обратно — баннер в кабинете). Экран тёмный, в акцентном цвете бренда, в центре сфера.

| Папка | Что внутри |
|---|---|
| `orb/` | Нейро-сфера на чистом WebGL: ~1800 узлов со связями и встречно вращающееся ядро; дышит, слушает (следует за микрофоном), думает (ускоряется), говорит (волна по сфере). Без WebGL — CSS-запасной вид; `prefers-reduced-motion` учитывается |
| `session/` | `VoiceSession` и две реализации: `ElevenLabsSession` (живой агент, SDK грузится только при старте разговора) и `BrowserSession` (сценарный интервьюер на речи браузера). `tools.ts` выполняет инструменты агента, `sounds.ts` синтезирует звуки интерфейса |
| `ui/` | `studio.tsx` — сцены: вступление → разговор → предоплата → сборка → макет ⇄ правки → согласование; подписи реплик, лента записанных фактов, окно фото (плюс перетаскивание на весь экран), просмотр номера |

Ответы сохраняются теми же запросами, что и формы, по одному за раз (очередь в `StudioStore.exclusive`), поэтому
разговор можно прервать и продолжить, а анкета в кабинете всегда актуальна. Бренд может показать свой виджет по живым
ответам (`BrandDefinition.VoicePreview`, хук `useStudioAnswers`): Cover Me рисует обложку по ходу разговора тем же кодом,
что и примерка на лендинге. Сервис и агент описаны в `services/voice/README.md`.

## Примерка обложки Cover Me (`src/brands/glossy/try-on/`)

Первый экран лендинга — настоящая обложка на canvas, в любом из четырёх стилей, с именем, которое вводит посетитель.
Кнопка «Примерить обложку со своим фото» ставит на неё его собственный снимок: голова выходит перед логотипом,
как в печатном номере. Готовую обложку можно отправить в сторис (картинка 1080×1920 с адресом сайта, через системное
«Поделиться» на телефоне) или скачать, а «Собрать журнал с этой обложкой» переносит имя, стиль и фото в заказ.

- **Фото не покидает устройство.** Человека на снимке находит MODNet в Web Worker (`matting.worker.ts`, onnxruntime-web,
  WebAssembly). Модель (13 МБ) и рантайм (~3 МБ сжатого WASM) грузятся только по нажатию кнопки (с прогрессом),
  а по наведению начинают подгружаться заранее. Имена файлов с версией, кэш навсегда (`next.config.ts`).
  `scripts/portrait-assets.mjs` перед `dev` и `build` кладёт их в `public/models` и `public/vendor` (в git не попадают).
- **Кадр как в печати.** Отрисовка (`draw-cover.ts`) повторяет `services/layout/src/templates/glossy-covers.ts`
  в тех же координатах (пункты A4), а положение головы, кадрирование и полосу выреза обе стороны берут из `@px/portrait`.
- **Пример по умолчанию** обведён заранее (`sample-portrait.ts`, `services/layout/scripts/trace.ts`), поэтому модель не
  грузится у каждого посетителя.
- **Передача в заказ** — `shared/lib/handoff.ts` (IndexedDB, неделя): форма заказа подставляет имя и после создания
  проекта сохраняет шаг «Герой номера» и загружает фото в «Портрет для обложки».

## Пример номера Cover Me на лендинге

`public/coverme/issue/*.webp` — настоящие страницы номера на 24 страницы. Их свёрстал layout-сервис
(шаблон `glossy-magazine@2`) по демо-анкете и растеризовал из печатного PDF без вылетов под обрез.
Список рубрик — в `src/brands/glossy/sample-issue.ts`. После изменения шаблона страницы нужно перегенерировать:
собрать демо-номер через `LayoutService.render` (см. `services/layout/scripts/sample.ts`), затем
`pdftoppm -r 110 -png layout.pdf r` и обрезать по 13 px с каждой стороны.
Фото в демо-номере и `public/coverme/cover-portrait.jpg` взяты с Unsplash (Unsplash License).
