# FarazSMS event-based refactor

The existing authentication, PostgreSQL notification/outbox jobs, preferences, accounting records and provider adapter are preserved. No separate notification queue or application was introduced. No deployment or Phase 4 work was performed.

## Configuration and UI

Open `/management/sms` as SUPER_ADMIN. The page contains a provider settings card, honest configuration status (not a claimed connection test), reminder timing, a category-filtered event list and a focused pattern/mapping editor. Each event has a separate provider code, enable flag, description, modification time and administrator. Blue/white RTL, Vazirmatn, mobile bottom navigation and desktop sidebar remain. Management tabs wrap instead of overflowing horizontally.

Provider keys remain AES-GCM encrypted, never returned to client components. A blank key retains the stored value; replacement and explicit deletion are supported. Saving configuration sends no messages. Existing development SMS adapters take precedence in their explicitly enabled development modes. Provider and template enable flags are independent.

## Events

| Event | Logical pattern | Required variables |
| --- | --- | --- |
| `auth.otp` | `delta_login` | code |
| `billing.invoice.issued` | `delta_charge_issued` | period, unit, amount, due_date |
| `billing.invoice.reminder` | `delta_charge_reminder` | unit, amount, due_date |
| `billing.invoice.overdue` | `delta_charge_overdue` | unit, amount, due_date |
| `billing.payment.confirmed` | `delta_payment_success` | unit, amount, receipt |
| `meeting.invitation` | `delta_meeting_invite` | title, date, time, location |
| `meeting.reminder` | `delta_meeting_reminder` | title, date, time |
| `ticket.status.changed` | `delta_ticket_update` | ticket, status |
| `announcement.emergency` | `delta_urgent_alert` | message |

Mappings run from application variable to the exact provider placeholder. Missing variables, invalid names and duplicate target names reject dispatch. All nine payloads have TypeScript types and strict Zod schemas. No provider pattern code is manufactured.

## Provider contract and reliability

The [official IPPanel Edge pattern API](https://ippanelcom.github.io/Edge-Document/docs/send/pattern/) accepts a `params` object. The adapter supplies all mapped variables, the configured code, sender and normalized recipient; it parses the documented `meta.status` and `data.message_outbox_ids`. It does not add undocumented endpoints, response fields or provider idempotency headers.

Existing NotificationDelivery, SmsDelivery, attempt history and PostgreSQL worker jobs are reused. Optional consent and current recipient access are checked again at dispatch. Canonical SMS dispatch hashes and a unique database constraint prevent duplicate submissions for the same business event/recipient. Meeting reminders are deduplicated even if the configured number of hours changes. Invoice reminder stages remain independently idempotent.

Explicit throttling uses bounded exponential retries. Provider rejection is permanent. Network loss, malformed confirmation and uncertain server failure remain UNKNOWN and are not blindly resent. Provider acceptance is ACCEPTED, not handset delivery. OTP values and provider credentials never enter audit details or browser responses. The audit retains template changes, event identity, attempts and provider IDs.

## Sources and schedules

Invoice events originate from committed existing billing records. Payment confirmation requires VERIFIED payment status, not a browser callback. Reminders use current outstanding balances, suppress paid/cancelled records, and are rechecked before sending. Defaults are 3 days before due, 2 days overdue, optional 7-day follow-up, and 24 hours before a meeting. All are configurable in PostgreSQL.

Meeting events retain the scheduled audience and revision, UTC storage and Asia/Tehran/Jalali display. Cancelled, past, stale-revision and unauthorized meetings are suppressed. Ticket SMS includes only reference and status; emergency SMS is a length-bounded approved constant, never private free-form announcement content. In-app mandatory emergency policy is unchanged; optional SMS consent is still honored.

The worker is bounded, not a persistent scheduler. It must be invoked regularly by the local/operator environment. A pre-due reminder requires an already issued invoice; if a monthly charge first exists at its first-day due time, a 3-day-advance reminder cannot be retroactively sent. Existing immutable due dates are preserved.

## Migration

`202611230006_sms_events` is transactional and additive. It creates SmsEventTemplate and SmsReminderPolicy, adds nullable SmsDelivery event and dispatch identities, foreign keys, indexes, mapping checks, unique event/dispatch keys and immutable binding guards. Existing target/outcome immutability remains enforced.

Legacy SmsProviderSetting and its encrypted API key are untouched. Only a valid legacy OTP pattern is migrated because its variable has an unambiguous meaning. Other category values remain stored and the UI explains that explicit event remapping is required. New patterns without a supplied provider code remain disabled. No reset, truncation or replacement of development data is used.

## Local commands

In separate PowerShell terminals as needed:

```powershell
Set-Location D:\Projects\delta-management
npm run db:local
```

Stop `npm run dev` before regenerating Prisma on Windows if its engine DLL is locked.

```powershell
npm run db:generate
npm run db:migrate
npm run dev
```

Run the existing bounded worker regularly; it queues and handles due jobs:

```powershell
npm run communications:worker -- 100
```

Verification commands:

```powershell
npm run typecheck
npm run lint
npx prisma validate
npm test
npm run test:integration
npm run test:e2e
npm run build
```

The production build was verified with `DELTA_ACCEPTANCE_DIST=true npx next build` (PowerShell: set `$env:DELTA_ACCEPTANCE_DIST='true'` first), keeping generated output separate from normal development. Prisma generation was executed separately.

## Limitations

No real API key, live SMS send or physical handset delivery was tested. Approved Edge-compatible Faraz patterns are still required. Handset delivery reports are not polled; acceptance remains unconfirmed delivery. Emergency patterns must accept the documented controlled message, not arbitrary text. Regular worker invocation is required; no hosting or scheduler deployment was performed.

The workspace has no `.git` directory, so a Git diff cannot be supplied. The files edited for this refactor are listed below; previously implemented work was retained.

## Files

- `prisma/schema.prisma`
- `prisma/migrations/202611230006_sms_events/migration.sql`
- `src/modules/sms/events.ts`
- `src/modules/sms/template-service.ts`
- `src/modules/sms/resolve-event.ts`
- `src/modules/sms/dispatch.ts`
- `src/modules/sms/faraz.ts`
- `src/modules/sms/settings.ts`
- `src/modules/sms/settings-form.tsx`
- `src/modules/sms/actions.ts`
- `src/modules/sms/service.ts`
- `src/modules/auth/sms.ts`
- `src/modules/notifications/delivery.ts`
- `src/modules/notifications/financial.ts`
- `src/modules/notifications/jobs.ts`
- `src/modules/notifications/queries.ts`
- `src/modules/notifications/labels.ts`
- `src/modules/notifications/components/screens.tsx`
- `src/modules/meetings/service.ts`
- `src/modules/tickets/service.ts`
- `src/app/(management)/management/sms/page.tsx`
- `src/components/navigation/nav.tsx`
- `tests/unit.test.ts`
- `tests/integration.test.ts`
- `tests/communications.test.ts`
- `tests/finance-e2e.ts`
- `tests/communications-e2e.ts`
- `README.md`
- `docs/farazsms-refactor.md`


## Executed verification

- TypeScript: passed (`npm run typecheck`).
- ESLint: passed (`npm run lint`).
- Prisma: validation and generation passed.
- Unit tests: 14 passed.
- Integration tests: 53 passed (21 communications, 21 financial, 11 foundation/SMS), using disposable databases. These include migration from real legacy settings, all nine provider mappings, required-variable validation, paid/cancelled suppression, privacy, concurrent business-event claims and actual adapter retry/unknown handling with mocked HTTP.
- Browser acceptance: foundation, financial/SMS and communications suites passed. SMS editor validation, multiple variable fields, category filter, keyboard focus, credential redaction and resident denial were exercised. Viewport widths 360, 390, 768 and 1440 passed RTL/navigation/no-horizontal-overflow checks. Screenshots are under `.local/screenshots/sms-events-*.png`.
- Worker: real bounded worker CLI executed against disposable databases; retry/deduplication and terminal-state tests passed.
- Production build: passed using the isolated output directory.
- Migration: applied successfully to an isolated clone of the existing development database, with nine event definitions and unchanged source data.

Tests used no real provider credentials or SMS traffic. Generated output and temporary databases were isolated; disposable databases were cleaned up. No production deployment was performed.


Local completion: migration 006 was applied to the existing development database after clone acceptance. Hash comparisons confirmed preservation of all original fields/rows in 54 pre-existing application tables; only the new nullable SMS metadata columns change row shape. Nine event definitions were created. The local development server was restarted on port 3000. No source-database worker was run to generate real SMS traffic.
