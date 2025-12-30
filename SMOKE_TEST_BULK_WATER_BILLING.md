# Bulk Water Billing Smoke Test

Use this checklist after deploying Feature 14. Assumes you have at least one property with occupied units.

## Setup
- Start the app and log in as admin/manager/caretaker.
- Ensure at least one unit has a previous water bill reading (optional, but helps validate prefill).

## Checklist
1) Open `/dashboard/water-bills/bulk` and confirm the page loads without errors.
2) Select a property and click "Load tenants".
   - Expect rows to populate and previous readings prefilled where available.
3) Edit the "Rate" in a single row.
   - Expect the "Global price per unit" and all row rates to update.
4) Enter a current reading for at least one row.
   - Expect units consumed + amount to compute and validation to show "Valid".
5) Set a due date and optional note.
6) Click "Send bulk water invoices".
   - Expect progress counters to move and per-row status to show Sent/Failed.
7) Confirm at least one communication + invoice exists (via statements or tenant view).

## Expected Results
- Invalid rows show a clear validation error and remain Pending.
- Sending processes rows in batches of 10 with per-row success/failure.
