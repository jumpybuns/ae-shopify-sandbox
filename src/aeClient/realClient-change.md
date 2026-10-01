# The change to realClient.js

`buildSystemParams` currently reads a static env token. Make it async and pull a
currently-valid token from the auth layer instead.

## Before
```js
function buildSystemParams(method) {
  return {
    app_key: process.env.AE_APP_KEY,
    method,
    sign_method: process.env.AE_SIGN_METHOD || 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    session: process.env.AE_ACCESS_TOKEN,   // <-- static, goes stale
  };
}
```

## After
```js
import { getValidAccessToken } from './auth/aeAuth.js';   // adjust relative path

async function buildSystemParams(method) {
  return {
    app_key: process.env.AE_APP_KEY,
    method,
    sign_method: process.env.AE_SIGN_METHOD || 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    session: await getValidAccessToken(),   // <-- always valid, auto-refreshes
  };
}
```

Then in `callApi`, add `await`:
```js
const systemParams = await buildSystemParams(method);
```

That's the whole wiring change. `getValidAccessToken()` returns the stored token, or
transparently refreshes it first if it has expired — so a long-running worker never
places an order with a dead token.
