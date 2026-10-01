// tokenStore.js
// Persists the AliExpress token pair so the app survives restarts without re-authorizing.
// Single-seller design: one row, id = 1. If you ever authorize multiple sellers, key by seller id.

import db from '../db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS ae_credentials (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    INTEGER NOT NULL,   -- epoch ms when the access token expires
    updated_at    TEXT DEFAULT (datetime('now'))
  );
`);

export function saveTokens({ accessToken, refreshToken, expiresInSeconds }) {
  // Refresh a little early (60s skew) so we never call with an already-dead token.
  const expiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
  db.prepare(`
    INSERT INTO ae_credentials (id, access_token, refresh_token, expires_at, updated_at)
    VALUES (1, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).run(accessToken, refreshToken, expiresAt);
}

export function getTokens() {
  return db.prepare('SELECT * FROM ae_credentials WHERE id = 1').get() || null;
}

export function isExpired(row = getTokens()) {
  if (!row) return true;
  return Date.now() >= row.expires_at;
}
