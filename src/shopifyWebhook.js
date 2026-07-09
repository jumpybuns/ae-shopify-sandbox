import crypto from 'node:crypto';
import express from 'express';
import db from './db.js';

function verifyHmac(rawBody, hmacHeader, secret) {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // timingSafeEqual needs equal-length buffers, guard against that first
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * onOrderCreate(payload, webhookId) is called once per *new* webhook
 * (already deduped). It should enqueue work, not process synchronously —
 * Shopify expects a fast 2xx response.
 */
export function createShopifyWebhookApp({ secret, onOrderCreate }) {
  const app = express();

  // IMPORTANT: HMAC verification needs the raw, unparsed body bytes.
  // If you use express.json() before this, the signature check will
  // silently break because the body gets re-serialized differently.
  app.use('/webhooks', express.raw({ type: 'application/json' }));

  app.post('/webhooks/orders/create', (req, res) => {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const webhookId = req.get('X-Shopify-Webhook-Id') || crypto.randomUUID();
    const topic = req.get('X-Shopify-Topic') || 'orders/create';

    if (!verifyHmac(req.body, hmacHeader, secret)) {
      console.warn('[webhook] HMAC verification failed');
      return res.status(401).send('invalid signature');
    }

    // --- Idempotency gate ---
    // Shopify retries webhooks on timeout/non-2xx. If we've already logged
    // this exact webhook id, ack it and do nothing further.
    const existing = db.prepare('SELECT id FROM webhook_events WHERE id = ?').get(webhookId);
    if (existing) {
      console.log(`[webhook] duplicate delivery of ${webhookId}, ignoring`);
      return res.status(200).send('already processed');
    }

    const payload = JSON.parse(req.body.toString('utf8'));

    db.prepare(
      'INSERT INTO webhook_events (id, topic, payload) VALUES (?, ?, ?)'
    ).run(webhookId, topic, JSON.stringify(payload));

    // Respond immediately, then hand off to the queue. Never await the
    // actual AliExpress order placement inside this handler.
    res.status(200).send('ok');

    onOrderCreate(payload, webhookId);
  });

  return app;
}
