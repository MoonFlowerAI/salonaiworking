/**
 * Tenant resolution and middleware.
 *
 * Strategies (in priority order):
 *   1. Path prefix:   /t/<slug>/...         → req.tenantId = <slug>
 *   2. Subdomain:     <slug>.<ROOT_DOMAIN>  → req.tenantId = <slug>  (only when ROOT_DOMAIN env var is set)
 *   3. Fallback:      DEFAULT_TENANT ('default') — existing single-salon data
 *
 * Slug rules: [a-z0-9][-a-z0-9]{1,31} (lowercase, hyphen, 2-32 chars, starts alnum).
 *
 * IMPORTANT: host-based tenant routing is OFF by default. Without ROOT_DOMAIN set,
 * the middleware NEVER treats a hostname prefix as a tenant. This prevents random
 * deploy hostnames (e.g. foo-abc.up.railway.app) from being interpreted as tenant slugs.
 */

const { readCollection, DEFAULT_TENANT } = require('../db');

const SLUG_RE = /^[a-z0-9][-a-z0-9]{1,31}$/;

function validSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

function tenantFromPath(req) {
  const m = req.path.match(/^\/t\/([a-z0-9][-a-z0-9]{1,31})(\/|$)/);
  return m ? m[1] : null;
}

function tenantFromHost(req) {
  const rootDomain = process.env.ROOT_DOMAIN;
  if (!rootDomain) return null; // Opt-in only. Without ROOT_DOMAIN, never extract a tenant from the host.

  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (!host) return null;

  // Never treat Railway/Vercel/Netlify deploy hostnames as tenant subdomains,
  // regardless of what ROOT_DOMAIN is set to. These are platform hostnames, not
  // customer subdomains.
  if (host.endsWith('.up.railway.app') || host.endsWith('.vercel.app') || host.endsWith('.netlify.app')) {
    return null;
  }

  const root = rootDomain.toLowerCase().replace(/^\./, '');
  // Host must end with ".<root>" — not just any subdomain of anywhere.
  if (!host.endsWith('.' + root)) return null;

  // Extract the part before the root. "acme.salonai.com" with root "salonai.com" → "acme"
  const sub = host.slice(0, host.length - root.length - 1);
  if (!sub) return null;
  // Only take the first label (most-specific subdomain)
  const firstLabel = sub.split('.').pop();
  if (!firstLabel || firstLabel === 'www' || firstLabel === 'api') return null;
  return validSlug(firstLabel) ? firstLabel : null;
}

async function resolveTenant(req) {
  const pathTenant = tenantFromPath(req);
  if (pathTenant) return pathTenant;
  const hostTenant = tenantFromHost(req);
  if (hostTenant) return hostTenant;
  return DEFAULT_TENANT;
}

/**
 * Express middleware: attaches req.tenantId and req.tenantFromPath (boolean).
 * If the tenant came from the path, also strips it from req.url so downstream
 * routers match as if the prefix weren't there.
 *
 * Defensive: any unexpected failure here falls back to the default tenant
 * rather than 500'ing the whole site. The only case we hard-fail on is when
 * an explicit non-default tenant was requested (via /t/<slug> or a matching
 * subdomain) but no such tenant is registered — that should return 404.
 */
function tenantMiddleware() {
  return async function (req, res, next) {
    try {
      const pathTenant = tenantFromPath(req);
      if (pathTenant) {
        req.tenantId = pathTenant;
        req.tenantFromPath = true;
        // Rewrite url: /t/acme/api/services  →  /api/services
        req.url = req.url.replace(/^\/t\/[a-z0-9][-a-z0-9]{1,31}/, '') || '/';
      } else {
        req.tenantId = DEFAULT_TENANT;
        req.tenantFromPath = false;
        const hostTenant = tenantFromHost(req);
        if (hostTenant) req.tenantId = hostTenant;
      }

      // Only verify existence when a non-default tenant was explicitly requested.
      // If the tenants row doesn't exist yet (fresh DB), treat the check as pass
      // for the default tenant and only fail for explicit non-default requests.
      if (req.tenantId && req.tenantId !== DEFAULT_TENANT) {
        let tenants;
        try {
          tenants = await readCollection('tenants') || [];
        } catch (err) {
          console.error('[tenant] failed to read tenants list, falling back to default:', err.message);
          req.tenantId = DEFAULT_TENANT;
          return next();
        }
        const exists = tenants.some(t => t.slug === req.tenantId);
        if (!exists) {
          // If the tenant came from the host (not an explicit /t/ path), silently
          // fall back to the default tenant rather than 404'ing. Prevents surprise
          // breakage when a host like `salonai-production.up.railway.app` is parsed
          // as a tenant slug because of a misconfigured ROOT_DOMAIN.
          if (!req.tenantFromPath) {
            console.warn(`[tenant] host-derived tenant "${req.tenantId}" not registered, falling back to default.`);
            req.tenantId = DEFAULT_TENANT;
            return next();
          }
          return res.status(404).json({ error: `Unknown tenant: ${req.tenantId}` });
        }
      }
      next();
    } catch (err) {
      console.error('[tenant] middleware error, falling back to default tenant:', err);
      req.tenantId = DEFAULT_TENANT;
      req.tenantFromPath = false;
      next();
    }
  };
}

async function listTenants() {
  const tenants = await readCollection('tenants') || [];
  return tenants;
}

async function tenantExists(slug) {
  if (slug === DEFAULT_TENANT) return true;
  const tenants = await readCollection('tenants') || [];
  return tenants.some(t => t.slug === slug);
}

module.exports = {
  tenantMiddleware,
  resolveTenant,
  tenantFromPath,
  tenantFromHost,
  listTenants,
  tenantExists,
  validSlug,
  DEFAULT_TENANT
};
