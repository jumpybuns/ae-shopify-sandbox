# AliExpress ⇄ Shopify Sync Sandbox

A hands-on rig for the architecture we sketched: a Shopify webhook receiver,
an order worker with idempotency + retry logic, a fulfillment poller, and a
**mock AliExpress server** standing in for the real third-party API — so you
can trigger every failure mode on demand instead of waiting for a flaky
supplier API to misbehave on its own schedule.

Verified working end-to-end (happy path, duplicate webhook delivery,
out-of-stock, address-rejected, and timeout/retry) before handing this over.

## What's actually running

```
:4000  your app       — receives Shopify order webhooks, verifies HMAC, dedupes
:4001  mock AliExpress — plays the supplier, admin page to "ship" orders by hand
```

Both run in a single process for simplicity (`src/index.js`), plus an
in-memory queue (`src/queue.js`) and a fulfillment poller
(`src/fulfillmentPoller.js`) that checks every 5 seconds (a real system
would poll every 15–30 min — it's fast here so you can watch it happen).

Data persists to a local SQLite file (`sandbox.db`) so you can inspect state
between runs.

## Quick start — fully local, no Shopify account needed

```bash
npm install
cp .env.example .env
npm start
```

You'll see something like:

```
[mock-ae] listening on http://localhost:4001
[mock-ae] admin page: http://localhost:4001/mock-ae/admin
[shopify-webhook] listening on http://localhost:4000
```

In a second terminal, fire test webhooks — these are cryptographically
signed the same way a real Shopify webhook would be, just built locally:

```bash
npm run test-webhook                       # normal successful order
npm run test-webhook -- out_of_stock       # AliExpress rejects the SKU
npm run test-webhook -- address_rejected   # AliExpress rejects the address
npm run test-webhook -- timeout            # AliExpress hangs — watch the retry/backoff
npm run test-webhook -- duplicate          # same webhook delivered twice — watch the dedupe
```

Watch the server terminal — you'll see the whole lifecycle: webhook
received → HMAC verified → dedup checked → queued → AliExpress order placed
→ status updated in SQLite.

Then open **http://localhost:4001/mock-ae/admin** — you'll see the order(s)
you just placed. Click **"Ship it"** and watch the server terminal: the
fulfillment poller picks up the status change within 5 seconds and (since
no real Shopify credentials are set) logs what it *would* push back to
Shopify.

### Things worth deliberately breaking

- Run `npm run test-webhook -- timeout` and watch the queue retry 3 times
  with backoff, then give up — this is the exact failure mode that's hard
  to reproduce on demand against a real API.
- Run `npm run test-webhook -- duplicate` and confirm the second delivery
  gets rejected at the `webhook_events` idempotency check, never reaching
  the order worker at all.
- Kill the server mid-flight (`Ctrl+C` right after firing a webhook) and
  restart it — inspect `sandbox.db` and confirm nothing double-placed.
- Try editing `mockAliExpress.js` to add a new failure mode (e.g. random
  5% failure rate) and see how much of your worker code needs to change
  to handle it (should be: none, if the idempotency/retry split is doing
  its job).

Inspect the DB directly any time:
```bash
node -e "import('node:sqlite').then(({DatabaseSync:D}) => console.log(new D('sandbox.db').prepare('SELECT * FROM orders').all()))"
```

## Next step: wire it to a real Shopify dev store

This is where you graduate from "the architecture works" to "it works
against Shopify's actual webhook delivery, retries, and address formats."

1. **Get a free dev store.** Sign up at partners.shopify.com, create a
   development store — no card required.
2. **Expose your local server publicly.** The Shopify CLI can tunnel for
   you, or just use `ngrok http 4000` if you have it installed.
3. **Register the real webhook.** Easiest path: Shopify admin →
   Settings → Notifications → scroll to Webhooks → add subscription for
   `Order creation`, pointing at
   `https://<your-tunnel-url>/webhooks/orders/create`. Grab the webhook
   signing secret it gives you and put it in `.env` as
   `SHOPIFY_WEBHOOK_SECRET`.
4. **Place a real test order** in the dev store (Shopify dev stores support
   a test payment gateway — no real money moves). Watch it land in your
   terminal exactly like the local test script did, except now it's real
   Shopify infrastructure doing the retries/delivery.
5. **Compare address payloads.** This is the most valuable part of doing
   it for real — a live Shopify order's `shipping_address` shape will
   differ slightly from the simplified one in `sendTestWebhook.js`. That
   gap is exactly what would trip up AliExpress's stricter address schema
   in production, and it's worth seeing with your own eyes before you're
   debugging it against real orders.
6. **Fulfillment push-back.** Once you're ready, get an Admin API access
   token (Partner Dashboard → your app → API credentials) and set
   `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_ADMIN_ACCESS_TOKEN` in `.env`. The
   `fulfillmentPoller.js` file has the GraphQL mutation stubbed — you'll
   need to add the `fulfillmentOrders` lookup step (documented in the code
   comment) since `fulfillmentCreateV2` needs a fulfillment order ID, not
   just the order ID.

## File map

```
src/
  index.js              — wires everything together, starts both servers + poller
  db.js                 — SQLite schema (orders, line_items, webhook_events)
  queue.js               — tiny in-memory queue with retry/backoff
  shopifyWebhook.js      — HMAC verification + idempotency gate
  orderWorker.js         — places AliExpress orders, idempotent, handles each failure mode
  mockAliExpress.js      — stand-in supplier API + admin page
  fulfillmentPoller.js   — checks for shipped orders, pushes tracking to Shopify
scripts/
  sendTestWebhook.js     — fires a locally-signed fake Shopify webhook
```
