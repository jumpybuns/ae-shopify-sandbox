import { DatabaseSync } from 'node:sqlite';

// A single SQLite file is plenty for a sandbox. Swap for Postgres later
// without changing much else — the shape of these tables is the same
// shape you'd want in production.
//
// Using Node's built-in node:sqlite instead of better-sqlite3: same
// synchronous prepare().run()/.get()/.all() API, but zero native
// dependencies to install (no prebuild-install, no compiled binary).
// Requires Node >= 22.5. It logs an "experimental" warning on startup —
// that's expected and harmless.
const db = new DatabaseSync('sandbox.db');
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,          -- Shopify's X-Shopify-Webhook-Id header
    topic TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    shopify_order_id TEXT PRIMARY KEY,
    ae_order_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending -> processing -> shipped | failed
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopify_order_id TEXT NOT NULL,
    ae_sku_id TEXT NOT NULL,
    title TEXT,
    qty INTEGER NOT NULL,
    FOREIGN KEY (shopify_order_id) REFERENCES orders(shopify_order_id)
  );
`);

export default db;
