# سامانه مدیریت ساختمان دلتا

> Initial Git checkpoint (2026-11-24): the interrupted sender-discovery work is preserved but incomplete. Current validation has four integration failures; see [the checkpoint verification report](docs/git-initial-verification.md). Historical acceptance results below describe earlier snapshots.

Persian-first Next.js modular monolith. Phase 1 identity/unit management plus Phase 2 billing, verified development payments, double-entry accounting and financial transparency, plus Phase 3 communications, private requests, notifications and meeting governance.

## Local development (Node 24)

1. Run `npm ci`.
2. In terminal A run `npm run db:local`. This starts isolated PostgreSQL on 127.0.0.1:55432, generates random credentials and AUTH_SECRET into ignored .env, and creates UTF-8 delta/delta_test databases. Keep it running.
3. In terminal B run `npm run db:migrate`, `npm run db:seed`, then `npm run dev`.
4. Open http://localhost:3000. Request OTP using your own Iranian mobile. With NODE_ENV=development, DEV_SMS=true and DEV_FIXED_OTP_ENABLED=true, enter `1234` after requesting a challenge. No code is logged or returned by the API. This opt-in bypass is rejected in production and test; approval is still required. Random challenge hashes are stored, never the fixed code.
5. Complete your name, then explicitly bootstrap the first real administrator: `npm run admin:bootstrap -- YOUR_IRANIAN_MOBILE`. This only promotes an existing completed registration; it creates no default administrator or password.
6. Sign in again. Use /management to register actual unit numbers/floors, approve users, connect owners/tenants, set billing responsibility and assign board roles.

The seed creates only the known building (Ardabil, capacity 18) and role vocabulary. It never invents units, residents, ownership or board appointments.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:integration` — creates and removes a uniquely named disposable local database; never resets existing data.
- `npx playwright install chromium webkit`, then `npm run test:e2e` — browser OTP and management workflows against a disposable clone of the existing local database on port 3001; validates original table contents are unchanged. The subsequent financial and communication browser suites use fresh disposable databases on ports 3002 and 3003. Requires the source database to have no other active connections while cloning.
- `npm run build`, then `npm start` — local production smoke check. Development SMS is disabled in production; configure a real SMS adapter before real production authentication.

## Configuration and security

See .env.example. Use a cryptographically random AUTH_SECRET of at least 32 characters and private PostgreSQL credentials. Never commit .env. APP_ORIGIN must exactly match the browser origin. Authentication route handlers verify Origin; payment callbacks independently verify provider records and do not trust redirect status. Authenticated mutations use Server Actions, independent authorization and Origin checks. All phone values are canonical +98. Sessions are opaque, hashed in PostgreSQL, HttpOnly, SameSite=Lax, Secure in production, expiring after seven days and revocable.

Without a trusted proxy, all requests share a conservative origin rate bucket. Set TRUST_PROXY=true ONLY behind a proxy that replaces untrusted forwarded headers; otherwise leave false. Production SMS requires a configured HTTPS SMS_ENDPOINT and SMS_TOKEN; the generic adapter posts {phone,code} and must be matched to the selected provider contract. No provider or paid messages are configured automatically.

A resident needs approval AND a current active unit relationship. OWNER/TENANT relationships never confer board access. Only SUPER_ADMIN can appoint board members; no chairperson is assumed. Audit histories cannot be edited. Membership/billing history is retained; billing overlaps are rejected with PostgreSQL exclusion constraints. Only real registered metrics are shown.

No sensitive page, API, RSC or financial data is service-worker cached. The public offline fallback, icons and immutable static assets are the only cache allowlist. PWA installation needs HTTPS or localhost. Android/desktop install via browser menu; iOS via Safari → Share → Add to Home Screen. Test actual iOS installation on an Apple device before release.

Jalali dates use Intl Persian calendar, Asia/Tehran. All timestamps are UTC in PostgreSQL. Money is stored and calculated with bigint Rial, then displayed exactly in Toman (including fractional Toman for individual Rial). Phase 2 financial records use an immutable, balanced ledger. No deployment or hosting configuration is included.

## Source map

src/app: auth/resident/management App Router screens, Server Actions and auth handlers.
src/modules: auth, users, building, units, board, audit, billing, payments, accounting, expenses, financial-reports, announcements, notifications, push, sms, tickets, meetings, governance and shared attachment domain services.
src/lib: database client, security, validation, dates and exact money formatting.
src/components: shadcn-style owned UI primitives, navigation, forms, responsive shell.
prisma: schema, SQL migrations and non-fictional metadata seed.
public: install icons, service worker, public offline fallback.
tests: unit, PostgreSQL integration and browser workflow checks.

On Windows, stop the Next.js server before regenerating the Prisma client, because Windows locks loaded engine DLLs. The browser test uses installed Chrome when available; otherwise install Playwright Chromium.


## Phase 1 acceptance — 23 November 2026

Implemented development-only fixed OTP verification and corrected active navigation states for nested unit pages, My units and Settings. No Phase 2 work or deployment was performed.

### Development OTP

The ignored local `.env` has `DEV_FIXED_OTP_ENABLED=true`; `.env.example` defaults to `false`. Run `npm run dev` with `DEV_SMS=true`. Request a challenge normally and enter `1234`. Both `NODE_ENV=development` and the exact string flag `true` are mandatory. Production/test reject the fixed code even with the flag enabled. No fixed-code hash or credential is saved: challenges retain random six-digit code hashes. Local SMS delivery is silent. The HTTP SMS provider abstraction remains available.

Expiration, five-attempt limits, request/verification rate limits, origin checks, pending approval, suspended-account restrictions, hashed sessions, secure production cookies and audit logging remain in place. No real user was approved or promoted by acceptance testing.

### Verification results

| Check | Result |
| --- | --- |
| `npm test` | PASS — 7 tests |
| `npm run test:integration` | PASS — 7 PostgreSQL tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — Next.js production build |
| `npm run test:e2e` | PASS — headless Chrome plus WebKit |
| Existing data preservation | PASS — hashes of every existing public table's rows matched before/after; no reset or truncation |

Integration tests migrate a newly created, uniquely named UTF-8 local database. Browser acceptance uses a uniquely named clone of the existing local database, preserving its schema, constraints and data. The original remains untouched. The clones and integration databases are dropped after use, which removes all test fixtures without disabling immutable audit/history protections. No real SMS is sent. Source database cloning requires no other active source connections; the acceptance workflow also needs a free unit slot. Existing identifiers are never overwritten if a fixture collides.

The browser workflow created `ACCEPTANCE-TEST`, a clearly named test administrator, test owner and test tenant in the disposable clone. It verified login/session cookies and the pending approval gate, explicit approval of fixtures, owner/tenant associations, billing assignment first to the owner then tenant, two retained history records with one current responsibility, rejection of overlapping billing rows, and denial of management access to an approved tenant. Integration tests additionally verify an approved resident cannot invoke membership/billing mutations, concurrent overlap rejection, history immutability, capacity, suspension/session revocation and rate limits.

At 360, 390, 768 and 1440 CSS pixels, browser checks covered home, unit list/detail, user management, profile and settings: RTL, Vazirmatn font loading, responsive bottom navigation/sidebar behavior, active navigation states and no horizontal page overflow. Android Pixel/Chrome emulation and iPhone/WebKit emulation also passed. Navigation links discovered across those pages returned successful responses. Validation errors, incorrect OTP errors, disabled loading feedback, basic keyboard Tab focus and browser runtime errors were checked. No browser runtime errors or OTP console disclosure were found.

Manifest standalone mode, RTL, icon requests, service-worker readiness, offline navigation fallback and a strict public cache allowlist passed. No HTML, API, RSC or authenticated page routes were cached. Screenshots are in ignored `.local/screenshots/`: `acceptance-360.png`, `acceptance-390.png`, `acceptance-768.png`, `acceptance-1440.png`, `iphone-webkit.png`, `resident-mobile.png`, and `management-desktop.png`.

Limitations: no physical Android device or ADB tooling was available, so actual installation and standalone launch are **not verified**. iPhone checks use WebKit emulation, not real Safari hardware. Safe-area CSS and `viewport-fit=cover` were reviewed; real nonzero notch/home-indicator insets remain a device check. Keyboard checks are a smoke test, not a full accessibility audit. Authentication error/loading states were exercised; the route-level loading skeleton and route error boundary were source-reviewed, not forced through a database outage. External production SMS delivery is not configured or tested.

### Exact manual Android installation (local USB, no deployment)

1. Install Android SDK Platform Tools on the computer and make `adb` available in the terminal. Enable Developer options and USB debugging on the Android phone. Connect it by USB, unlock it and accept the computer's debugging authorization.
2. In this repository keep the existing local database running. Ensure `.env` contains `APP_ORIGIN=http://localhost:3000`, `DEV_SMS=true` and `DEV_FIXED_OTP_ENABLED=true`. Run `npm run dev` and leave it running. Do not change or reset the database.
3. Run `adb devices` and confirm the phone is listed as `device`. Then run `adb reverse tcp:3000 tcp:3000`. With multiple devices, use `adb -s SERIAL reverse tcp:3000 tcp:3000` for the intended device.
4. On the phone open Chrome and visit `http://localhost:3000`. USB reverse makes this the computer's local server while preserving the localhost secure context needed by the PWA. A plain HTTP LAN address is not equivalent.
5. In Chrome choose **⋮ → Add to Home screen → Install**, or **⋮ → Install app**, depending on the Chrome version. Confirm the installation prompt.
6. Close Chrome, find **ساختمان دلتا** in the launcher and open it. Confirm it launches without Chrome's address bar and has its own app-switcher entry. Request a login challenge normally and enter `1234`; existing approval gates still apply. Do not bootstrap or approve a real user solely for this installation check.
7. After one online visit, run `adb reverse --remove tcp:3000` to make the local server unreachable, disable Wi-Fi/mobile data, then relaunch or reload the app. Confirm the public Persian offline fallback appears rather than a cached private page. Re-enable connectivity and run `adb reverse tcp:3000 tcp:3000` to resume online local testing. Keep USB connected and the server running; remove the mapping when finished.

### Files edited for this acceptance

- `.env` (ignored local flag only), `.env.example`
- `scripts/local-db.ts`
- `src/modules/auth/development-otp.ts` (new), `src/modules/auth/service.ts`, `src/modules/auth/sms.ts`
- `src/app/api/auth/verify/route.ts`
- `src/components/shared/auth-form.tsx`
- `src/components/navigation/nav.tsx`, `src/styles/globals.css`
- `tests/database.ts` (new), `tests/unit.test.ts`, `tests/integration.test.ts`, `tests/e2e.ts`
- `README.md`

Build/typecheck and browser runs also generated ignored `.next`, TypeScript incremental state and screenshot artifacts. Database schema/migrations, production credentials and real building/resident records were not changed.


## Phase 2 implementation and operation

### Implemented workflows

- Effective-dated charge policies retain previous/new Rial amounts, administrator ID, reason and audit history. No board resolution is required. A new policy never changes an issued invoice.
- Jalali monthly billing stores Gregorian boundaries at Asia/Tehran midnight. The canonical key is `YYYY-MM` in the Persian calendar; due time is the last millisecond of the same month. Issuance is one transaction for all active units, is idempotent under concurrency, and resolves policy and billing responsibility **at the beginning of that month**. If any unit lacks a matching record, the entire run rolls back with an actionable error. A new mid-month relationship therefore first qualifies for next month's bill; the application does not invent historical assignments. Future months can be queued and will not run before their start.
- Every invoice keeps its original policy, responsibility, responsible name, unit label and items. Corrections create separate signed, immutable adjustments and balanced entries. Cancellation reverses the invoice and any corrections; paid or in-flight invoices cannot be cancelled. Cancelled unit/month identities cannot be reused. Corrections cannot reduce total below verified allocations or race an in-flight payment.
- Payment intents check the authenticated member, invoice and outstanding balance server-side. A single active intent is reused after retries/crashes. Only independent provider verification can create a verified payment, allocation and journal. Duplicate and concurrent callbacks cannot double-post. Amount, currency and provider transaction identity are checked. Residents only access invoices/receipts issued to them.
- Local mock payment outcomes: success, failure, cancellation, delayed verification and verification failure. Actual duplicate callbacks and concurrent verification are tested, rather than merely displaying a success page. The mock's outcomes are stored independently from browser redirect parameters. `PAYMENT_PROVIDER=mock` is accepted **only** in `NODE_ENV=development`; production and test reject it even when configured accidentally. No gateway credentials, endpoints or signature contracts have been invented. Live production payments are unavailable until a documented provider adapter is supplied.
- Verified gateway funds debit clearing, not bank. An authorized administrator records actual settlement with a unique supporting reference; the settlement moves net funds to bank and posts fees separately. Bank opening balance is a separate audited record. There is no assumed initial cash.
- Expenses have categories, Jalali date input, description, payee, Rial amount, authenticated attachments, draft/posted/paid/reversed states and audit events. Administrators post recognition, pay from bank and reverse with exact inverted journal lines. Bank payment locks prevent concurrent overspending. PDF/PNG/JPEG attachments are limited to 2 MiB, checked for matching signatures, stored privately, and downloaded as attachments by managers only.
- Other income has a separate administrator workflow, unique documentary reference, actual bank account, payer/date, journal posting and reversal. It never reclassifies a gateway payment as settled cash.
- Resident transparency returns an explicit safe DTO with unit number, period, charge, paid amount, outstanding amount and status. It excludes personal identities, phone numbers, bank details and gateway identifiers. Resident reports show aggregate revenue/expenses; administrators have the full ledger, payment/settlement records, trial balance, bank/clearing/receivable/payable balances, monthly collected payments and operating result.
- PostgreSQL outbox jobs use unique keys, row locks, `SKIP LOCKED`, retry backoff and stale-lease recovery. The worker handles queued invoice generation and payment verification/reconciliation. Synchronous payment correctness does not depend on the worker. Future notification events are retained but do not send any messages.

### Migration and preservation

`prisma/migrations/202611230003_financial/migration.sql` is additive and transaction-wrapped. It was applied to the existing local database with all 13 Phase 1 tables verified unchanged by row-count/content hashes before and after. Verification evidence is in ignored `.local/phase2-migration-verification.json`. No reset, truncation, real resident fixture, invoice, payment, opening balance or expense was inserted into the development database.

The migration adds 19 financial tables: ChargePolicy, BillingPeriod, Invoice, InvoiceItem, InvoiceCorrection, PaymentIntent, PaymentAllocation, MockPayment, Account, JournalEntry, JournalLine, FinancialAccount, ExpenseCategory, Expense, ExpenseDocument, OpeningBalance, Reconciliation, OutboxJob and Income. Only account/category vocabulary and a named bank-account container are initialized; no monetary balances are fabricated.

Database protections include foreign keys, indexes, unique unit/period invoices, provider transaction uniqueness, one live intent per invoice, unique journal source/reversal, nonnegative/positive amount checks, non-overlapping policies/periods, exact policy/responsibility snapshots, immutable issued/posted history, deferred balanced-posting checks, exact reversal checks and allocation locking/limits. Prisma cannot express all these cross-row rules; the SQL migration is their authority. All posting services use explicit database transactions.

### Exact local commands (PowerShell, Node 24)

```powershell
Set-Location D:\Projects\delta-management
npm ci
```

If the existing local database is not already running, keep this in terminal A:

```powershell
npm run db:local
```

In terminal B:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

The existing ignored `.env` has `DEV_SMS=true`, `DEV_FIXED_OTP_ENABLED=true`, `PAYMENT_PROVIDER=mock` and `APP_ORIGIN=http://localhost:3000`. The committed example defaults the fixed OTP to false and the payment provider to unconfigured. Do not replace existing database credentials or reset the database. Development login requires requesting a normal challenge, then entering `1234`; approval and active unit membership still apply.

Administrators use `/management/finance`, `/management/finance/payments`, `/management/finance/income` and `/management/expenses`. Residents use `/charges`, invoice detail, `/payments` and `/reports`. Register actual units/members/responsibilities, choose a charge policy, and issue a valid month. No default units, residents or fictional financial transactions are created. The original administrator bootstrap remains explicit and is only needed for the first legitimate administrator.

For a development worker run in a separate terminal:

```powershell
$env:NODE_ENV = 'development'
npm run finance:worker -- 20
Remove-Item Env:NODE_ENV
```

Invoke the bounded worker periodically with a local scheduler if automatic retries/monthly jobs are desired. There is no installed system schedule or permanent worker process. Notification delivery is not configured. Production worker processes must use their normal production environment and cannot use the mock provider.

Stop application servers before Prisma generation/build on Windows. Run verification with:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npx playwright install chromium webkit
npm run test:e2e
npm run build
```

`npm run test:finance` and `npm run test:e2e:finance` run just the financial suites. Tests create uniquely named disposable databases and remove them afterward, then compare the existing database's row-content hashes. They never reset/truncate the source database. Browser tests need ports 3001/3002 free; do not run two Next development servers for this repository simultaneously. The Phase 1 browser clone needs the source database idle and a free unit slot. Playwright uses installed Chrome when available.

### Files added or edited in Phase 2

- Database/configuration: `prisma/schema.prisma`, `prisma/migrations/202611230003_financial/migration.sql`, `next.config.ts`, `package.json`, `.env.example`, ignored `.env`, `scripts/local-db.ts`.
- Billing: `src/modules/billing/actions.ts`, `calendar.ts`, `schemas.ts`, `service.ts`, `jobs.ts`, `components/form.tsx`, `components/display.tsx`.
- Other services: `src/modules/payments/providers/index.ts`, `src/modules/payments/service.ts`, `src/modules/accounting/service.ts`, `src/modules/accounting/income.ts`, `src/modules/expenses/service.ts`, `src/modules/financial-reports/service.ts`.
- Resident screens: `src/app/(resident)/home/page.tsx`, `charges/page.tsx`, `charges/invoices/[id]/page.tsx`, `payments/page.tsx`, `payments/mock/[authority]/page.tsx`, `payments/receipt/[id]/page.tsx`, `reports/page.tsx`.
- Management screens: `src/app/(management)/management/page.tsx`, `finance/page.tsx`, `finance/payments/page.tsx`, `finance/income/page.tsx`, `expenses/page.tsx`.
- Routes: `src/app/api/payments/callback/route.ts`, `src/app/api/finance/documents/[id]/route.ts`.
- Navigation/money: `src/components/navigation/nav.tsx`, `src/lib/utils/index.ts`.
- Tooling/tests/documentation: `scripts/finance-worker.ts`, `tests/unit.test.ts`, `tests/finance.test.ts`, `tests/finance-e2e.ts`, `tests/e2e.ts`, `README.md`.

No dependency was added. Build, migration checks and screenshots also produce ignored artifacts under `.next` and `.local`.

### Operational limits

The live gateway is deliberately unconfigured. No external SMS/payment/settlement API or notification delivery is claimed. Bank settlements and other income require manual administrator confirmation against actual documentary evidence. Automatic provider settlement import, refunds and provider-specific fee contracts await a selected provider. Lists show a bounded recent set (100 invoices/expenses/income, 200 payments, 30 journal entries); all historical records remain in PostgreSQL, but this iteration has no export or list pagination. The policy list shows the latest 30 policies. Financial reports are actual database aggregates, with collection by verification date and revenue/expense by journal occurrence date; clearing/bank/trial balances are cumulative. Physical device installation and real iOS safe-area behavior remain unverified; Phase 1 manual Android installation steps above still apply. No deployment, hosting/domain changes, Phase 3 or Phase 4 work was done.


### Phase 2 executed verification — 23 November 2026

| Executed check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | PASS |
| ESLint (`npm run lint`) | PASS, no warnings |
| Unit tests (`npm test`) | PASS, 9 tests including exact large/fractional Toman and Jalali leap/month/date boundaries |
| Database integration (`npm run test:integration`) | PASS, 27 tests: 20 financial plus 7 Phase 1 regressions |
| Full browser suite (`npm run test:e2e`) | PASS, Phase 1 plus financial workflows |
| Stricter financial browser console check (`npm run test:e2e:finance`) | PASS; no unexpected console/runtime errors |
| Production build (`npm run build`) | PASS |
| Worker command (`npm run finance:worker`) | PASS, zero pending development jobs |
| Existing development records | PASS, all 13 original Phase 1 tables unchanged through the additive migration |

Financial invariants exercised against isolated PostgreSQL include concurrent invoice generation, full rollback when a responsibility is missing, immutable billing snapshots, charge policy ranges, invoice corrections/cancellation, idempotent intent creation, no payment from browser redirect alone, failure/cancellation/delay/retry outcomes, six simultaneous first-time verifications, duplicate callbacks, unique provider transaction identity, over-allocation/overpayment rejection, deferred rejection of unbalanced journals, immutable posted entries/lines, exact reversals, bank/clearing/fee separation, duplicate settlement handling, expense documents/post/pay/reversal, opening balances, concurrent bank overspending rejection, other-income posting/reversal, resident permissions/privacy, report-to-ledger consistency and concurrent outbox claiming/retries.

Financial browser acceptance executed administrator charge configuration, idempotent monthly issuance, resident invoice details, mock checkout, receipt, independent callback verification, duplicate callbacks, unit-status transparency, resident access denial, manager-only attachment downloads, expense recognition/payment, bank settlement and non-charge income/reversal. It checked resident and management routes at 360, 390, 768 and 1440 CSS pixels for RTL, navigation and no horizontal page overflow, plus offline fallback and no private financial cache entries. Screenshot capture now preserves the caret to avoid Playwright mutating not-yet-hydrated streamed forms; console assertions permit only the expected resource failure during the explicitly simulated offline step.

Screenshots: ignored `.local/screenshots/finance-resident-{360,390,768,1440}.png`, `finance-management-{360,390,768,1440}.png` and `finance-dashboard-{360,390,768,1440}.png`. Phase 1 screenshots and Android/iPhone emulation results are retained by the regression suite. Physical Android installation was not performed. Financial browser assertions run in desktop Chrome with responsive viewport emulation; no real gateway, real banking or real-device financial test is claimed.


## Phase 3 — communications, notifications and governance

Phase 3 continues the existing implementation; it does not replace Phase 1 or Phase 2. This project directory has no `.git` metadata, so a Git diff/status could not be obtained. Existing source files, Prisma schema and migration history were inspected directly. The partially implemented communication services were retained and completed.

### Functional workflows

- Managers and authorized board members create announcement drafts, choose categories/priorities/audiences, upload attachments, schedule or publish, and archive. Publication locks the announcement, snapshots eligible recipients, creates notifications transactionally and deduplicates people associated with multiple units. Published text and audiences cannot be rewritten; publish a new record after archiving. Audience membership is based on current approved users and active unit relationships; manager/board audiences use the existing roles, without inventing a chairperson.
- Residents see only addressed announcements, their own explicit read receipt, attachments, publication/expiration and archive state. Notification read/unread status is separate from an announcement's explicit study receipt. Managers see aggregate recipient/read/channel counts, not a public recipient list. Emergencies have red text/status indicators and mandatory persistent in-app notification; a failed optional channel does not remove it.
- The persistent notification center has 20-row pagination, unread count, read/unread actions, mark-all-read, categories and authenticated links. The header badge reads the user's own unread count from PostgreSQL. Notifications and their recipients/event keys are immutable; read state may change.
- Per-user preferences cover general, financial, meeting and ticket notifications plus optional push/SMS channels. Required operational/security messages remain in-app. These preferences never disable the existing OTP authentication provider.
- Web Push uses standards-based subscriptions, explicit user-gesture permission requests, multiple owned devices, encryption at rest with AES-256-GCM derived from `AUTH_SECRET`, endpoint hashing, endpoint allowlisting, revocation and expiration cleanup. No endpoint or subscription keys appear in the device UI. Push payloads and Service Worker display text are generic; notification clicks always open the authenticated `/notifications` route. The public cache allowlist remains unchanged. Missing VAPID settings disable real delivery gracefully.
- Notification SMS uses a separate provider-independent interface, the existing Iranian phone normalization, immutable generic templates, persistent queue/delivery records, stable idempotency keys, attempt logs and provider-reference fields. The development provider performs no network send and reports `SIMULATED`. No production SMS adapter, endpoint or response format has been invented. OTP behavior is preserved separately.
- Tickets support private, idempotent creation; own-unit selection; categories/priorities; attachments; manager assignment; comments and resident replies; legal status transitions; resolution/reopening; event history; filtering and pagination. Every operation and download checks the actor on the server. Missing and unauthorized private record pages render the same not-found UI without protected content. As documented by Next.js, a streamed not-found page can retain HTTP 200 after headers have been sent; non-streamed pages use 404. Private attachment route handlers explicitly return 404. Residents cannot access another resident's ticket or its files.
- Meetings support board, owner and general invitations; agenda, location/HTTPS link, UTC timestamp, Jalali/Tehran display, RSVP, manager-recorded attendance, cancellation/completion and private attachments. Resident views do not enumerate other participants or their contact information. Invitation recipients are snapshotted. Rescheduling creates a new revision and invalidates stale reminder jobs.
- Minutes and resolutions are append-only versions. Once final/published, an amendment requires a reason; previous versions and attachments remain available to authorized participants. Managers can assign an approved responsible member and track resolution status. Recording a meeting, attendance or a resolution is not automatic proof of legal validity or quorum; no board president/chairperson is assigned.
- New invoices, verified payment receipts and charge-policy changes enqueue financial notifications from the existing source records. Due/overdue scans use real remaining invoice balances and unique event keys. Paid/cancelled invoices do not produce fresh overdue reminders. No accounting entry or billing calculation is replaced.

### Scheduling, delivery and failure semantics

`parseTehranDateTime` in `src/modules/notifications/calendar.ts` converts Persian civil dates using `Intl`/IANA `Asia/Tehran` timezone data and validates the resulting local wall clock. It does not assume a fixed UTC offset or add hours across DST changes. Historical nonexistent spring-forward times and ambiguous fall-back times are rejected with a Persian instruction to choose another time. Modern Tehran times, historical summer offsets and midnight round trips are unit-tested.

The existing PostgreSQL outbox/worker now processes scheduled publication, notification fan-out, meeting reminders, financial reminders, push/SMS attempts and expiration cleanup. Job keys are unique, claims use `FOR UPDATE SKIP LOCKED`, attempts act as fencing tokens, stale leases recover, and failures back off exponentially. General jobs have an eight-attempt terminal `DEAD` state; channel sends have a five-attempt limit with immutable attempt outcomes.

External delivery is not falsely reported as device receipt: Web Push is `ACCEPTED` only after a successful push-service response, while `DELIVERED` is reserved for persisted in-app notifications. No provider message ID is fabricated when a push service does not supply one. Development SMS is explicitly `SIMULATED`; unconfigured or opted-out channels are `SKIPPED`. If a process dies during a network send, the result becomes `UNKNOWN` and is not blindly resent. Exactly-once physical delivery cannot be inferred after an uncertain network outcome; the in-app record and manager history remain available for review. One user's notification preferences or one failed channel do not roll back other recipients' in-app messages.

### Additive migration and data preservation

`prisma/migrations/202611230004_communications/migration.sql` is transaction-wrapped and additive. It adds 20 models: Announcement, AnnouncementAudience, AnnouncementRecipient, AnnouncementRead, Notification, NotificationPreference, NotificationDelivery, NotificationDeliveryAttempt, PushSubscription, SmsTemplate, SmsDelivery, Ticket, TicketComment, TicketEvent, Meeting, MeetingParticipant, MeetingMinutes, Resolution, ResolutionVersion and CommunicationAttachment.

The migration adds foreign keys, indexes, recipient/event uniqueness, attachment-parent and size/type constraints, legal states/transitions, publication timing checks, subscription/delivery ownership protections, sequential amendment checks and immutable-history triggers. It extends the existing OutboxJob status constraint to allow terminal `DEAD` jobs. It inserts only six generic SMS template definitions, not residents, announcements, tickets, meetings or messages.

The migration was first executed repeatedly in disposable test databases, then applied to the existing local `delta` database. Row-count/content hashes verified all **32 existing Phase 1/2 tables unchanged** before/after applying it. The proof is in ignored `.local/phase3-migration-verification.json`. There was no database reset, truncation or deletion of existing records. Worker command verification ran against an isolated test database, not the user's pending development jobs.

### Local operation

Keep the existing PostgreSQL process running; do not start a second copy or reset it. From this directory:

```powershell
Set-Location D:\Projects\delta-management
npm run db:migrate
npm run dev
```

On a fresh dependency install, run `npm ci` before starting application/database helper processes. On Windows, stop Next servers before Prisma generation/build. Existing sessions, registration, approval, unit membership and administrator bootstrap rules remain unchanged.

The same bounded worker handles finance and communications; invoke it periodically with a local scheduler when scheduled publishing/reminders/retries are desired:

```powershell
npm run communications:worker -- 20
```

For explicit local SMS simulation only:

```powershell
$env:NODE_ENV = 'development'
$env:NOTIFICATION_SMS_PROVIDER = 'development'
npm run communications:worker -- 20
Remove-Item Env:NOTIFICATION_SMS_PROVIDER
Remove-Item Env:NODE_ENV
```

`NOTIFICATION_SMS_PROVIDER=development` is rejected outside development. The committed example defaults to `unconfigured`. Real notification SMS remains unavailable until a provider is selected and a documented adapter is implemented.

To configure real Web Push, generate your own application VAPID key pair with the installed `web-push` CLI (`npx web-push generate-vapid-keys --json`) and place `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and a valid `VAPID_SUBJECT` in the ignored `.env`. Keep the private key server-side. No VAPID keys or real delivery credentials were created or exposed by this implementation. Then users explicitly enable push preferences and register their browser from `/settings/notifications`. iPhone support depends on the OS/browser and installed Home Screen web app; no physical-device result is claimed.

Resident routes: `/announcements`, `/announcements/[id]`, `/notifications`, `/requests`, `/requests/new`, `/requests/[id]`, `/meetings`, `/meetings/[id]`, `/settings/notifications`.

Management routes: `/management/communications`, `/management/communications/deliveries`, `/management/announcements`, its editor/new routes, `/management/tickets`, ticket details, `/management/meetings`, meeting editors/details/minutes/resolutions, and `/management/resolutions`.

### Phase 3 changed-file inventory

- Schema/migration: `prisma/schema.prisma`, `prisma/migrations/202611230004_communications/migration.sql`.
- Existing service integration: `src/modules/billing/service.ts`, `src/modules/billing/jobs.ts`, `src/modules/expenses/service.ts`, `scripts/finance-worker.ts`.
- Communication services: `src/modules/announcements/service.ts`, `src/modules/tickets/service.ts`, `src/modules/meetings/service.ts`, `src/modules/governance/service.ts`, `src/modules/push/service.ts`, `src/modules/sms/service.ts`, `src/modules/attachments/service.ts`.
- Notification services/UI: `src/modules/notifications/{service,common,delivery,financial,jobs,queries,calendar,actions,labels,read-boundary}.ts` and `components/{form,display,push-controls,screens}.tsx`.
- Resident route files under `src/app/(resident)/{announcements,notifications,requests,meetings,settings/notifications}`; existing settings and home links were extended.
- Management route files under `src/app/(management)/management/{announcements,tickets,meetings,resolutions,communications}`; the existing management home gained a communication link.
- API routes: `src/app/api/push/route.ts`, `src/app/api/attachments/[id]/route.ts`.
- Shared navigation/PWA: `src/components/layout/shell.tsx`, `src/components/navigation/nav.tsx`, `public/sw.js`.
- Dependencies/config/docs: `package.json`, `package-lock.json`, `.env.example`, `README.md`. The real Web Push dependency is `web-push` with its TypeScript definitions; no infrastructure service was added.
- Tests: `tests/communications.test.ts`, `tests/communications-e2e.ts`, `tests/unit.test.ts`, and the existing finance integration outbox-drain allowance. Generated build, screenshots and preservation proofs remain ignored under `.next`/`.local`.

### Verification and limitations

Run the full verification from the repository:

```powershell
npm run typecheck
npm run lint
npx prisma validate
npm test
npm run test:integration
npx playwright install chromium webkit
npm run test:e2e
npm run build
```

Focused commands: `npm run test:communications` and `npm run test:e2e:communications`. The communication browser uses port 3003; Phase 1 and financial browsers use 3001/3002. Tests use uniquely named disposable databases and compare source database row hashes afterward. They never reset or truncate the development database. Browser screenshots preserve the caret to avoid introducing hydration mutations during streamed form rendering.

Real SMS delivery, real push-service acceptance and physical-device display have not been tested because no production SMS adapter/VAPID configuration or physical device was provided. The code does not label those untested paths as delivered. Push endpoint allowlisting currently covers Google FCM, Mozilla Push, Apple Web Push and Windows WNS host families; another push service needs an explicit reviewed allowlist addition. Changing `AUTH_SECRET` requires re-registering encrypted subscriptions. A periodic worker invocation is required for scheduled work; this task does not install a permanent worker or operating-system schedule. A network-uncertain send requires manager review rather than automatic duplication. General list pages have pagination; detail history and the latest communication overview audit subset remain backed by complete append-only database records. No deployment, hosting/domain changes, Phase 4 equipment/vendor/service scheduling or unrelated project changes were made.


### Phase 3 executed acceptance — 23 November 2026

| Executed check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, no warnings |
| `npx prisma validate` | PASS |
| `npm test` | PASS — 11 unit tests |
| `npm run test:integration` | PASS — 45 tests: 18 communications, 20 finance and 7 Phase 1 |
| `npm run test:e2e` | PASS — complete Phase 1, finance and communications suites, exit code 0 |
| `npm run build` | PASS — production compilation, types and route generation |
| Worker CLI | PASS — actual bounded Node/tsx worker invocation against an isolated database |
| Additive migration | PASS — 32 existing tables' row counts/content hashes unchanged |
| UI mechanical check | PASS — no findings |

The communication browser exercised manager publication, targeted resident reading, explicit read receipts, unread badge/center actions, private ticket creation and replies, assignment/status changes, meetings, attendance, final minutes, resolutions, preferences, device registration/revocation and per-channel history. It checked 360/390/768/1440px resident and manager routes, no horizontal page overflow, RTL, bottom navigation/sidebar behavior, offline fallback and absence of private records in caches. Unauthorized record pages were checked for the not-found screen/noindex and absence of protected content; private downloads returned 404. The Next.js streamed-page HTTP 200 behavior described above is accounted for rather than mistaken for authorization success.

Integration tests additionally exercised selected-unit/owner/tenant/board audiences, multi-unit recipient deduplication, stale scheduled-publication revisions, mandatory versus optional preference handling, encrypted push ownership/SSRF rejection, five-attempt retry limits, uncertain-send crash recovery without resending, ticket IDOR/assignment/state/history, meeting audience privacy, early/stale reminder rejection, append-only minutes/resolution amendments, actual invoice/payment/policy reminder deduplication, concurrent outbox claims and terminal job failures. Unit tests cover historical Tehran DST gaps/overlaps, offsets and Service Worker lock-screen privacy/safe click destinations. No real SMS, real Push acceptance or physical-device delivery was asserted.

Screenshots: `.local/screenshots/communications-resident-{360,390,768,1440}.png` and `communications-management-{360,390,768,1440}.png`. Test fixtures are explicitly labelled and exist only in disposable databases. All test databases were removed after verification. The development communication tables contain no announcement, ticket, meeting, resolution, notification or subscription fixtures. No application server is left running; the original local PostgreSQL process is preserved.


### Local login origin

`APP_ORIGIN` is the exact browser origin used for CSRF protection (local default: `http://localhost:3000`). In development, opening the alternate loopback hostname redirects navigation to that configured origin. Reload the login page after changing this configuration; restart `npm run dev` after editing `.env`. Direct cross-origin authentication requests remain rejected. Fixed OTP `1234` requires both `NODE_ENV=development` and `DEV_FIXED_OTP_ENABLED=true`; request a code before verifying it.


### Fixed monthly charge and cumulative debt

The initial monthly amount is effective from its selected starting month and persists until a later approved change. Subsequent policy changes require a finalized, non-cancelled meeting's minutes; their immutable version ID is retained in the financial audit. Existing policies and posted records remain unchanged. The manager explicitly selects the minutes containing the approval; the application does not establish legal quorum or interpret their text.

The bounded `npm run finance:worker -- 100` command catches up missing monthly charge jobs from the first effective policy through the current Tehran month (up to 24 scheduled months per sweep). Each month uses its own effective amount and responsible resident. Concurrent runs and repeated processing do not duplicate charges. New periods are due at the first Tehran midnight; existing periods retain their original due dates. Run the command regularly and at month start; it is not a persistent scheduler. Active units and a valid financial responsibility at each month's start are required. Missing assignments fail transactionally and surface in job history. No payments are presumed.

The home page, charges, resident financial reports and management finance show total outstanding debt and unpaid/partially paid months per unit across all recorded months. Approved residents see unit numbers and financial totals, without names, contact details, invoice identifiers or bank information. Missing records are not represented as proof of settlement. Real-world prior debts require verified historical policies and responsibilities; they are never invented or inferred from the current amount.

Ad hoc expense invoicing and share allocation remain a separate workflow from recurring charges. No production payment provider or SMS delivery is enabled by these changes.


Latest fixed-charge verification: TypeScript and ESLint passed; 13 unit tests and 46 integration tests passed using disposable databases, with source table snapshots unchanged. Financial browser acceptance passed at 360/390/768/1440px, covering worker-created charges (without a manual issuance click), due dates, payment, receipt, privacy, cumulative debt region, RTL, navigation, offline fallback and cache isolation. Generated test output uses `.next-acceptance` to avoid the user's development server. No real resident data or payments were created.


### Preregistered unit contacts and Faraz SMS settings

Management → Units → select a unit → owner/tenant forms allow names and optional Iranian mobile numbers before the first login. A normalized phone reuses the same account. New accounts remain pending unless the manager explicitly checks approval; suspended users require the existing user-management flow. Unit contact replacement closes prior memberships and related current financial responsibilities without rewriting their history or moving old debts. Contact priority for active non-vacant units is tenant phone, then owner phone; this does not reassign billing responsibility or forward one person's private notifications to another. Existing approved unit memberships prefill the forms when no dedicated contact exists.

Settings → Faraz SMS is restricted to SUPER_ADMIN. Add the API key and sender, then configure approved provider codes and variable mappings for each application event. API keys are AES-256-GCM encrypted with a domain-separated key derived from AUTH_SECRET and never returned to the browser. An empty key retains the old key; explicit deletion removes it. Rotating AUTH_SECRET requires re-entering the provider key. The integration uses the documented IPPanel Edge pattern endpoint: https://ippanelcom.github.io/Edge-Document/docs/send/pattern/ . Confirm that the Faraz account uses Edge; Legacy provider APIs remain unsupported. Multiple variables are configured in the event-based editor described below. Saving settings sends no SMS. Real sending remains disabled until explicitly enabled with valid settings; existing local DEV_SMS and notification development-provider behavior take priority.

Provider acceptance and outbox IDs are recorded as ACCEPTED, never DELIVERED. Network timeouts, malformed confirmations and server errors have unknown outcomes and are not blindly retried; explicit throttling uses the existing bounded retry policy. No credentials or real SMS were used during acceptance.

Migration `202611230005_contacts_sms` adds only UnitContact and SmsProviderSetting with foreign keys, contact uniqueness, phone checks and enabled-provider configuration checks. It was tested on an isolated clone of the development database as well as fresh disposable test databases. Existing development rows remained unchanged during testing.


Contacts/SMS verification: TypeScript, ESLint, 13 unit tests, 48 integration tests and production build passed. Extended browser acceptance passed at 360/390/768/1440px including contact preregistration, adding a missing tenant phone, pending status, SMS settings save/redaction, resident denial, and no horizontal overflow. Provider calls were mocked; no real SMS was sent. Migration 005 was then deployed locally with checksum comparison proving all 52 pre-existing application tables unchanged. The local development server was restarted successfully on port 3000.


### Event-based FarazSMS configuration

The former per-category/single-variable UI is superseded by nine independent event templates with multiple variable mappings and configurable reminder stages. See [the implementation, migration, verification and local-command report](docs/farazsms-refactor.md). Legacy provider values are preserved and unambiguous OTP configuration is migrated; other events require explicit provider codes and mapping review. No real SMS delivery is claimed.


FarazSMS event-refactor verification: TypeScript, ESLint, Prisma validation/generation, 14 unit tests, 53 integration tests, all three browser suites and production build passed. SMS management acceptance covers 360/390/768/1440px, multiple-variable editing, missing-code validation, category filtering, keyboard focus and credential redaction. Worker verification ran only against isolated databases. Migration 006 was clone-tested, then applied locally with original data in 54 application tables preserved. No live SMS or deployment was performed.
