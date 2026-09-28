/**
 * Adds `Server-Timing: app;dur=<ms>` to every response: the time from the
 * request reaching Express to the response headers being sent, which covers
 * the database queries and building the response, but not the network
 * between the client and the server.
 *
 * That split matters for measuring performance: a client far from the
 * server sees the network round trip on top of this number, and
 * scripts/load-test.js reports both. Browsers show it in DevTools
 * (Network → Timing).
 */
export function serverTiming() {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    const writeHead = res.writeHead;
    res.writeHead = function timedWriteHead(...args) {
      if (!res.headersSent) {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`);
      }
      return writeHead.apply(this, args);
    };
    next();
  };
}
