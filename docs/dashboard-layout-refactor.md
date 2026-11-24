# Dashboard, residents and physical layout refactor

## Root cause of the missing Unit 32

The previous `/management` page read `db.unit.count()` and aggregate membership counts, but never queried or rendered individual unit records. `/home` used the resident dashboard for every role, with `UnitMembership.userId = currentUser.id`; a manager without a personal ownership/tenancy relationship therefore saw no unit cards. Registering a unit did not create a personal relationship with the administrator, correctly, but the dashboard depended on that relationship incorrectly.

The fix uses an authorized management overview for both manager entry points, including BOARD_MEMBER, and a separately authorized resident overview. Managers see every registered building unit, including inactive, vacant, unassigned and pending-member units. No Unit 32 special case exists in application code. Live Neon data was not inspected or modified for this refactor; the root cause is established by the old query/render paths and reproduced in isolated tests.

These pages are explicitly dynamic and use request-time Prisma reads. There was no Prisma result cache to clear. Unit/layout actions invalidate management, home and units; financial actions and verified payment callbacks also invalidate the management overview. The resident unit selector uses a validated URL parameter, never a trusted client-side unit ID.

## Membership and primary contact

`UnitMembership` already supplies the explicit many-to-many user/unit relationship, its OWNER/TENANT/AUTHORIZED kind, temporal constraints and append-only end dates. It is reused rather than replaced. Each person has their own unique canonical phone/account and may have several memberships. Adding a person does not create invoices or change a payer.

Unit detail now offers a separate "add independent resident" form with optional primary-contact selection and an explicit management activation choice. The existing `UnitContact` row per unit/kind is now treated as the primary contact, not the complete resident list. Changing it preserves all other memberships and billing responsibility. Ending a residence requires the existing explicit end-membership operation. Existing ownership/tenancy/approval fields, notification preferences and history remain intact. No administrative role is granted by either form.

Management sees the roster and phone numbers. Resident dashboards contain only the current account's permitted units, responsible invoices, verified payments, recipient-authorized announcements and private tickets. Pending pages select only the current account's assigned unit labels/status; there is no newly invented public registration/requested-unit model.

## Physical layout and migration 008

`202611240008_building_layout` is additive:

- Nullable `Unit.physicalPosition`, positions 1–3 from right to left; existing rows initially retain null.
- `PhysicalUnitGroup` and `PhysicalGroupMember`, preserving separate financial Unit identities and snapshot unit numbers, grouping start/end timestamps, optional occupant caption and audit trail.
- Foreign keys including building identity, unique group/unit membership, a GiST exclusion constraint preventing overlapping physical memberships, and existing immutable relationship guards for group history.
- Deferred constraints requiring 2–3 adjacent, same-floor members and agreeing intervals. Active grouped units cannot silently change layout/number or lose a physical position.
- A unique expression index uses the same normalized floor key as the application, preventing Persian/Arabic/English digit aliases or inferred floors from allocating the same physical position twice. The SQL normalization function and application helper are tested together, including long identifiers without numeric rounding.

The floor key uses explicit floor metadata first; blank/unknown metadata falls back to the tens prefix of a fully numeric identifier. Unrecognized nonnumeric identifiers remain on an unknown floor and cannot be grouped until floor metadata is provided. Existing explicit floor labels are authoritative: labels such as "3" and "سوم" are not guessed to be synonyms. Default order is deterministic numeric-aware order of registered units only. Explicit positions override it. If legacy data has more than three entries on a floor, extra entries remain visible on additional rows; groups span only adjacent positions in one three-position row.

Creating a group freezes that row's inferred positions so later inserts cannot silently shift the group's adjacency. Group operations serialize on the building lock; payer updates additionally acquire ordered unit locks. Ending a group preserves its records, and regrouping creates a new period. Position changes and future occupancy changes retain before/after audit metadata.

### Units 21 and 22

The manager can select the existing two units, confirm physical adjacency and enter the supplied occupant caption. The combined card shows `21 + 22`, spans two positions, and provides individual details and balances. It creates neither a person nor a phone number. No real Dr. Manafi account or real unit was invented or seeded.

The units remain independently chargeable. Overview totals reduce each unit/invoice once, irrespective of membership count or visual grouping. A common payer is an explicit separate operation requiring an approved active membership in every selected unit; it reuses the existing billing assignment logic in one transaction. Failure on any unit rolls back all changes. Already-issued invoices and posted ledger entries are never rewritten by grouping or payer changes.

## Local verification and migration plan

Tests use local, uniquely named disposable databases and check the original local tables are unchanged. The migration compatibility test builds v7, seeds a unit, membership, invoice and posted balanced ledger entry, applies migration 008 and compares every prior table's content (excluding the newly added nullable column). Fresh migration-deploy paths are exercised separately.

Commands:

```powershell
npm run typecheck
npm run lint
npx prisma validate
npx prisma generate
npm test
npm run test:integration
npm run test:e2e
npm run build
```

`npm run test:e2e:dashboards` specifically exercises manager Unit 32 visibility without personal membership, independent resident provisioning, primary-contact preservation, position changes, physical grouping and ungrouping, a common payer, resident unit switching, invoice navigation, IDOR and pending-user isolation, plus 360/390/768/1440px RTL layouts and bottom navigation. Screenshots are under ignored `.local/screenshots/building-map-*.png` and contain synthetic TEST data only.

Production rollout requires separate explicit authorization. After a backup/recovery check, apply the reviewed additive migration with `prisma migrate deploy` against the designated remote database using its secure direct migration connection; then deploy the matching application code with its pooled runtime connection. Do not deploy this code against an unmigrated v7 schema. Do not reset, truncate, import local residents, merge financial units, or infer billing responsibility from grouping. Then configure real physical positions and the actual 21/22 group through management using existing identities.

No Vercel deployment or live Neon write is part of this task. Physical-device installation and production acceptance are outside this local verification. Service/maintenance counts come only from existing resident issue tickets; no Phase 4 equipment, service schedule, vendor or work-order module was introduced.
