# FarazSMS sender selection — 2026-11-24

This completes the interrupted sender settings/actions/UI work recorded in the initial Git checkpoint. The nine event definitions and variable mappings are unchanged.

## Implementation

- Super-admin-only, origin-checked Server Actions fetch accessible lines server-side. API keys remain encrypted in PostgreSQL, or come from the server-only `FARAZSMS_API_KEY` environment variable. Existing keys are never returned to the browser.
- `GET https://api.iranpayamak.com/ws/v1/lines/accessible` uses `Api-Key` and `Accept: application/json`, a bounded timeout, bounded pagination and no cache. Errors expose diagnostic codes, never raw provider responses or credentials.
- The isolated parser derives its **candidate contract** from official `@farazsms_official/n8n-nodes-farazsms@0.2.0` source (`GenericFunctions.getLines/extractRows`): `status: success`, `data` as an array or `data.data`, and row `number`. This is SDK evidence, **not verification of a live endpoint response**. Unknown shapes fail closed. No pattern capability fields are invented.
- One candidate is proposed automatically; multiple candidates require selection. Account accessibility does not establish pattern permission. The administrator must explicitly confirm that permission before enabling sends. No sender is hardcoded as fallback.
- When discovery fails, the administrator can explicitly choose manual configuration, enter a panel-confirmed numeric sender and confirm permission. This is an administrator attestation, not independent provider verification. Saving settings never sends SMS.
- Sender authorization is bound to the credential hash. Rotation, disappearance and empty discovery results revoke stale selections/confirmation. Advisory locking, optimistic revisions and a second check after network requests prevent concurrent stale updates.
- The pattern adapter uses the verified IranPayamak request contract: `line_number`, `code`, `recipient`, `number_format: persian`, and multiple `attributes`; HTTP success plus `status: success` and a positive safe integer `data` establishes provider acceptance only. Uncertain outcomes are not automatically resubmitted.

## Database

The existing migration `202611230007_sms_senders` is preserved without rewriting history. It adds sender provenance, confirmation, a bounded application-validated line snapshot, credential binding and a check timestamp. Its SQL constraint permits unchanged legacy rows, while requiring complete, credential-bound confirmation for newly configured enabled senders. Discovery alone cannot authorize pattern sending. Historical SMS/event configuration is preserved.

The migration test creates a pre-007 disposable database, stores an enabled legacy sender and all nine event configurations, applies 007, and verifies their original values remain intact. Other integration and browser tests migrate fresh isolated databases and compare the development database contents before/after cleanup.

Migration 007 was subsequently applied to the local development database. Hash comparison of all 56 existing application tables (excluding newly added columns and migration metadata) confirmed their pre-existing contents were unchanged. No database was reset.

Legacy settings are retained but need explicit administrator confirmation before the new adapter can send. A previously stored sender is not silently treated as permission to use a pattern.

## Executed verification

- TypeScript, ESLint and Prisma schema validation passed.
- Unit tests: 15 passed, zero failures.
- Integration tests: 61 passed, zero failures/skips, including all four original checkpoint failures, sender authorization, credential rotation, concurrent configuration changes, migration preservation, worker concurrency and uncertain-outcome deduplication.
- Financial/browser acceptance passed, including mocked single/multiple-line discovery, loading state, invalid-key diagnostics, manual fallback, encrypted-key redaction, independent event editing, existing financial workflows and 360/390/768/1440px RTL/no-overflow/navigation checks. PWA offline fallback and sensitive-cache isolation passed.
- Production build (`npm run build`, including Prisma generation) passed using isolated `.next-acceptance` output. An initial Windows DLL lock during concurrent migration verification was resolved by rerunning after that process exited.

The three old SMS fixtures were updated to explicit manual authorization and the verified request/acceptance contract. The time-dependent reminder test now creates its own invoice through the real billing service, avoiding notifications from earlier worker scenarios; its suppression and deduplication assertions remain intact. No assertions were weakened or tests skipped.

## Validation commands

```powershell
npm run typecheck
npm run lint
npx prisma validate
npm test
npm run test:integration
npm run test:e2e:finance
$env:DELTA_ACCEPTANCE_DIST='true'
npm run build
Remove-Item Env:DELTA_ACCEPTANCE_DIST
```

Start local PostgreSQL with `npm run db:local`, apply additive migrations with `npm run db:migrate`, and start the UI with `npm run dev`. Manage provider settings at `/management/sms`. Automated tests use mocked provider HTTP and disposable databases; browser provider interception is test-only and refuses a non-acceptance database. No real SMS is sent.

## Remaining provider limitations

Live sender discovery, account permissions, shared/service-line pattern eligibility and real SMS acceptance/delivery have not been verified. A sanitized real response or provider-confirmed schema is still needed to independently validate the discovery contract. Unexpected responses remain errors with the safe manual path available. Provider acceptance is never described as handset delivery. No deployment is performed.
