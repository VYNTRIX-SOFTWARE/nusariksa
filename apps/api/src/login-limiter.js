const WINDOW_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 5000;

export function createLoginLimiter({ now = Date.now, windowMs = WINDOW_MS } = {}) {
  const entries = new Map();

  function get(key, time) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= time) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  function keys(address, email) {
    return [
      ['ip:' + address, 30],
      ['email:' + email, 5],
    ];
  }

  function allow(address, email) {
    const time = now();
    const targets = keys(address, email);
    for (const [key, limit] of targets) {
      if ((get(key, time)?.failures ?? 0) >= limit) return false;
    }
    if (entries.size >= MAX_ENTRIES) {
      for (const key of entries.keys()) get(key, time);
      if (entries.size >= MAX_ENTRIES && targets.some(([key]) => !entries.has(key))) {
        return false;
      }
    }
    return true;
  }

  function failure(address, email) {
    const time = now();
    for (const [key] of keys(address, email)) {
      const entry = get(key, time);
      if (entry) entry.failures += 1;
      else if (entries.size < MAX_ENTRIES) {
        entries.set(key, { failures: 1, expiresAt: time + windowMs });
      }
    }
  }

  function success(address, email) {
    entries.delete('email:' + email);
  }

  return { allow, failure, success };
}
