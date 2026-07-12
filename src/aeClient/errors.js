// Shared across mock and real clients so orderWorker.js can handle both
// identically: TransientError means "worth retrying" (network blip,
// timeout, rate limit), PermanentError means "retrying won't help"
// (out of stock, bad address, rejected order) — same distinction the
// architecture doc drew from the start, just formalized into types now
// that there are two implementations that both need to honor it.

export class TransientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransientError';
  }
}

export class PermanentError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PermanentError';
    this.code = code;
  }
}
