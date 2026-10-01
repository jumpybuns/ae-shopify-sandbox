// authorize.js
// Run ONCE (node auth/authorize.js) to get your first token pair.
// It starts a tiny listener on your callback path, prints the consent URL, and waits.
// You open the URL in a browser, log in as the seller, click authorize, and AliExpress
// redirects back here with ?code=... which we exchange and store.
//
// PREREQUISITES:
//   - ngrok tunnel running, pointing at PORT below
//   - your AE app's redirect URI set to  <ngrok-url>/ae/callback  (matches CALLBACK_PATH)
//   - env: AE_APP_KEY, AE_APP_SECRET, AE_REDIRECT_URI (the full ngrok callback URL)

// Loads .env into process.env — required because this is a standalone
// script, not routed through index.js (which may load dotenv itself but
// that doesn't help a separately-run file). Without this, every
// process.env.AE_* lookup below silently comes back undefined, which is
// exactly what produced "client_id=undefined&redirect_uri=undefined" in
// the consent URL.
import 'dotenv/config';
import http from 'node:http';
import { exchangeCode } from './aeAuth.js';

const PORT = process.env.AUTH_PORT || 4100;
const CALLBACK_PATH = '/ae/callback';

// CONFIRM this authorize host/path in your app console — it migrated with the platform.
// This is the current international-platform pattern; adjust if your console shows otherwise.
const AUTH_BASE = 'https://api-sg.aliexpress.com/oauth/authorize';

function consentUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.AE_APP_KEY,
    redirect_uri: process.env.AE_REDIRECT_URI,
    // Forces a fresh auth session instead of reusing a stale browser
    // cookie that may be pinned to the wrong account/login type.
    force_auth: 'true',
    // state guards against CSRF — verify it comes back unchanged.
    state: Math.random().toString(36).slice(2),
  });
  return `${AUTH_BASE}?${params}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== CALLBACK_PATH) {
    res.writeHead(404).end('not the callback');
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('no code in callback');
    return;
  }
  try {
    const tokens = await exchangeCode(code);
    console.log('\n✅ Tokens obtained and stored. Access token expires in ~',
      tokens.expiresInSeconds, 'seconds.');
    res.writeHead(200).end('Authorized. You can close this tab and return to the terminal.');
  } catch (err) {
    console.error('\n❌ Token exchange failed:', err.message);
    res.writeHead(500).end('exchange failed — check terminal');
  } finally {
    setTimeout(() => server.close(() => process.exit(0)), 500);
  }
});

server.listen(PORT, () => {
  console.log(`Listening for the AliExpress redirect on :${PORT}${CALLBACK_PATH}`);
  console.log('\n1. Make sure ngrok is forwarding to this port and your app\'s redirect URI matches.');
  console.log('2. Open this URL in a browser, log in as the seller, and click Authorize:\n');
  console.log('   ' + consentUrl() + '\n');
});
