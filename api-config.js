/* ───────────────────────────────────────────────
   BinBin — API Configuration (Auto-detect)
   In production: frontend is served by Express,
   so API = same origin (no port difference).
   In dev: frontend on :8080, API on :3001.
   ─────────────────────────────────────────────── */

const API = (function() {
  const host = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol;

  // Production: served from Express (same origin)
  if (port !== '8080') {
    return window.location.origin;
  }

  // Dev: frontend on :8080, backend on :3001
  return protocol + '//' + host + ':3001';
})();
