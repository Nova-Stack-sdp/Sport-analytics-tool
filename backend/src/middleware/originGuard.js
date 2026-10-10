/**
 * originGuard — CSRF defence for the cookie-authenticated API.
 *
 * The session cookie (__session) is SameSite=None in production — the Netlify
 * frontend and the Northflank backend are different sites — so a browser
 * attaches it to cross-site requests too, including ones made by a hostile
 * page. CORS alone is not a defence: it stops the attacker READING the
 * response, but the state change still happens server-side unless the
 * request is rejected.
 *
 * Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE requests
 * (and on same-site ones in modern browsers), so the rule is: a mutating
 * request whose Origin is present must come from the same allowlist the CORS
 * config already trusts, otherwise 403. Requests with no Origin header at
 * all — curl, server-to-server calls, the test suite — carry no ambient
 * cookie risk and pass through.
 *
 * Reads are never touched: they cannot be CSRF'd into changing anything, and
 * blocking them would take public API consumers (which send no Origin for
 * plain fetches from other servers) with them.
 */
export function createOriginGuard({ allowedOrigins = [], wildcard = false } = {}) {
  const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

  return function originGuard(req, res, next) {
    if (!MUTATING_METHODS.includes(req.method)) return next();

    const origin = req.headers.origin;
    if (!origin) return next();
    if (wildcard || allowedOrigins.includes(origin)) return next();

    return res
      .status(403)
      .json({ error: 'Request origin is not allowed', code: 'ORIGIN_NOT_ALLOWED' });
  };
}
