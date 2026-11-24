# Management-provisioned membership

Production and Preview use the server-only `MEMBERS_ONLY_LOGIN=true` setting. Public login cannot create users: unknown, inactive, suspended or unassigned accounts cannot request an OTP, and eligibility is checked again during verification. The error does not identify whether a particular account exists. Denied requests retain the existing rate counters and a sanitized audit record.

Managers register owner/tenant names and optional phones in unit management. The access activation checkbox is checked by default: saving it with a phone explicitly activates the account and unit association at that management step. No second resident registration or approval request is needed. Saving a contact without a phone still works and creates no login account. Managers can leave activation unchecked when recording a contact without granting access. Suspension is never lifted by the contact form.

An active unit membership is required for a resident; an explicitly assigned, active management role admits managers independently of unit assignment. Adding a resident never grants a management role. Existing low-level approval/status fields remain the access-control representation, not a public sign-up workflow.

The initial production owner was explicitly bootstrapped through the existing audited administrator command following the owner's instruction. This was a targeted database operation, not an automatic privilege assignment in OTP authentication. No local resident data was imported and no database was reset.

The legacy development onboarding flow remains available when the flag is disabled for existing local fixtures. The account-scoped temporary OTP configuration remains unchanged and expires at its original deadline.
