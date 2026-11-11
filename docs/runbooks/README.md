# Runbooks

One file per incident type. Each runbook has: **Symptoms → Check → Fix → Verify → Follow-up**.

| Runbook            | Sprint | Status |
| ------------------ | ------ | ------ |
| failed-payments.md | 4      | TODO   |
| webhook-backlog.md | 4      | TODO   |
| database-down.md   | 4      | TODO   |
| backup-restore.md  | 8      | TODO   |
| payout-mismatch.md | 8      | TODO   |

## Daily check (15 min, from pilot onward)

1. Sentry: new issues in the last 24h
2. Payments: Razorpay captured vs ledger, any stuck HELD bookings
3. pg-boss: failed and stuck jobs
4. Uptime / status page
