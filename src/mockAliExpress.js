import express from 'express';

// In-memory "AliExpress" order store. This plays the role of the third
// party you don't control — which is exactly why it's useful: you get to
// script its misbehavior on demand instead of waiting for the real API
// to flake out.
const aeOrders = new Map();
let nextId = 1000;

export function createMockAliExpressApp() {
  const app = express();
  app.use(express.json());

  // Place an order. Behavior is controlled by `simulate`, so you can force
  // specific failure modes while testing your worker's handling of them:
  //   success (default) | out_of_stock | address_rejected | timeout
  app.post('/mock-ae/order', async (req, res) => {
    const { simulate = 'success', shopify_order_id, line_items, address } = req.body;

    console.log(`[mock-ae] order request for Shopify order ${shopify_order_id}, simulate=${simulate}`);

    if (simulate === 'timeout') {
      // Never respond — this is what a real hung request from a flaky
      // third-party API looks like. Your worker needs its own timeout.
      return;
    }

    if (simulate === 'out_of_stock') {
      return res.status(409).json({ error: 'SKU_OUT_OF_STOCK', message: 'Item no longer available' });
    }

    if (simulate === 'address_rejected') {
      return res.status(422).json({ error: 'INVALID_ADDRESS', message: 'Address failed carrier validation' });
    }

    const aeOrderId = `AE-${nextId++}`;
    aeOrders.set(aeOrderId, {
      aeOrderId,
      shopifyOrderId: shopify_order_id,
      lineItems: line_items,
      address,
      status: 'placed',       // placed -> shipped
      trackingNumber: null,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ ae_order_id: aeOrderId, status: 'placed' });
  });

  // Poller hits this to check on an order.
  app.get('/mock-ae/order/:id/status', (req, res) => {
    const order = aeOrders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ ae_order_id: order.aeOrderId, status: order.status, tracking_number: order.trackingNumber });
  });

  // Manual "ship it" action — this is what you'll click in the admin page
  // below to simulate the supplier finally shipping the pedal.
  app.post('/mock-ae/order/:id/ship', (req, res) => {
    const order = aeOrders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    order.status = 'shipped';
    order.trackingNumber = `TRACK${Math.floor(Math.random() * 1e8)}`;
    res.json({ ok: true, tracking_number: order.trackingNumber });
  });

  // Tiny admin page so you can eyeball orders and flip status by hand,
  // instead of curling everything.
  app.get('/mock-ae/admin', (req, res) => {
    const rows = [...aeOrders.values()]
      .reverse()
      .map(
        (o) => `
      <tr>
        <td>${o.aeOrderId}</td>
        <td>${o.shopifyOrderId}</td>
        <td>${o.status}</td>
        <td>${o.trackingNumber ?? '—'}</td>
        <td>${
          o.status === 'placed'
            ? `<form method="POST" action="/mock-ae/order/${o.aeOrderId}/ship"><button>Ship it</button></form>`
            : ''
        }</td>
      </tr>`
      )
      .join('');

    res.send(`
      <html>
        <head>
          <title>Mock AliExpress Admin</title>
          <style>
            body { font-family: sans-serif; padding: 2rem; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
            form { margin: 0; }
            button { cursor: pointer; }
          </style>
        </head>
        <body>
          <h1>Mock AliExpress — Supplier Admin</h1>
          <p>This stands in for a supplier's dashboard. Click "Ship it" to trigger
             a tracking number, then watch the fulfillment poller pick it up.</p>
          <table>
            <tr><th>AE Order ID</th><th>Shopify Order ID</th><th>Status</th><th>Tracking</th><th></th></tr>
            ${rows || '<tr><td colspan="5">No orders yet — send a test webhook first.</td></tr>'}
          </table>
        </body>
      </html>
    `);
  });

  // Support the ship form POST (HTML forms only do GET/POST, no query string body)
  app.use(express.urlencoded({ extended: true }));

  return app;
}
