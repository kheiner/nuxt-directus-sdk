# Proxy

The module can create a proxy at `/directus` that forwards requests from your Nuxt server to Directus. This eliminates CORS issues, handles cookie forwarding for session auth, and (in dev) proxies WebSocket connections for realtime.

::: tip Renamed from `devProxy`
The option was originally called `devProxy` because it only worked in development. It now works in production builds too, so the name has been generalised to `proxy`. The old name still works as an alias but logs a deprecation warning. Rename your config at your convenience.
:::

## Default Behaviour

The proxy is **enabled by default in development** and **disabled in production**. Most users don't need to configure anything.

```typescript
// nuxt.config.ts, zero config needed
export default defineNuxtConfig({
  modules: ['nuxt-directus-sdk'],
  directus: {
    url: process.env.DIRECTUS_URL,
  },
})
```

Browser requests that would normally go to `https://your-directus.com/items/posts` instead go to `http://localhost:3000/directus/items/posts` and the Nuxt server forwards them.

The proxy automatically picks up Nuxt's port, including dynamic port changes (3000 → 3001 when you already have a server running).

## Configuration

```typescript
export default defineNuxtConfig({
  directus: {
    proxy: {
      enabled: true, // default: true in dev, false in prod
      path: '/directus', // HTTP proxy mount path
      wsPath: '/directus-ws', // WebSocket proxy path (for realtime)
    },
  },
})
```

- **`enabled`** (`boolean`, default: `true` in dev, `false` in prod). Turns the proxy on or off.
- **`path`** (`string`, default: `/directus`). The URL path prefix the proxy mounts under.
- **`wsPath`** (`string`, default: `/directus-ws`). Separate path for WebSocket connections. Kept separate from `path` because the HTTP handler can't also terminate a WebSocket upgrade cleanly.

**Shorthand:** pass a boolean to enable/disable with defaults.

```typescript
export default defineNuxtConfig({
  directus: {
    proxy: true, // same as { enabled: true }
  },
})
```

```typescript
export default defineNuxtConfig({
  directus: {
    proxy: false, // disable, use the direct URL even in dev
  },
})
```

## Why It Exists

Three problems it solves:

1. **CORS.** Your Nuxt dev server is on `http://localhost:3000`. Directus is on `https://your-directus.com`. Without the proxy, every browser request is cross-origin and needs CORS headers configured on Directus. With the proxy, requests are same-origin.
2. **Cookies.** Session-based authentication relies on httpOnly cookies. Cookies are scoped to the domain that sets them, so a `Set-Cookie` from Directus wouldn't be honoured by a browser fetching from `localhost`. The proxy rewrites the cookie domain so the cookie is accepted.
3. **WebSockets.** Realtime subscriptions use the WebSocket protocol, which has its own handshake and CORS rules. The `wsPath` proxy handles this with cookie forwarding so auth survives the upgrade.

## Works with Split URLs

If you've set up separate `client` and `server` URLs (for Docker, Kubernetes, or any setup where your Nuxt server reaches Directus via an internal hostname), the proxy forwards to the `server` URL and exposes it under the proxy path to the browser. Same-origin for the browser, internal hostname for the backend, no special handling on your end.

See the [`url` option reference](/api/configuration/module#url) for split-URL configuration.

## Disabling the Proxy

If you want browsers to talk to Directus directly even in development (for instance, you've configured CORS on Directus and prefer real URLs in DevTools Network panel), disable the proxy:

```typescript
export default defineNuxtConfig({
  directus: {
    proxy: false,
  },
})
```

Or disable just the WebSocket proxy by leaving `enabled: true` and setting `wsPath: false` (HTTP proxy on, realtime goes direct).

## Production Behaviour

In production builds the proxy is off by default and all requests go directly to the `client` URL from the browser. This is what most users want: no extra hop, no Nuxt server involvement on every Directus call. For this to work with session auth, cookie domains have to match, either same apex domain or configured correctly. See the [Authentication guide](/guide/authentication) for the cross-domain setup.

### Enabling the proxy in production

Sometimes the direct-from-browser route doesn't work. The most common case is hosting Directus on a different domain than your Nuxt app where you can't (or don't want to) deal with cross-domain cookies. Third-party cookie restrictions in modern browsers make this increasingly fragile, especially in staging environments. Turning the proxy on in production puts the session cookie back on your own origin:

```ts
export default defineNuxtConfig({
  directus: {
    url: process.env.NUXT_PUBLIC_DIRECTUS_URL,
    proxy: { enabled: true }, // or just `proxy: true`
  },
})
```

With this set, the module registers a Nitro server handler at `/directus/**` in your production build that forwards HTTP requests to Directus, preserving cookies on your own domain.

**Trade-offs to know about:**

- **Extra hop on every Directus call.** Browser to your Nuxt server to Directus instead of browser to Directus. Negligible for occasional calls like login; can add up on data-heavy pages.
- **WebSocket proxy is dev-only.** The realtime proxy uses the Nuxt dev-server's upgrade hook, which doesn't exist in production builds. If you turn the HTTP proxy on in production, realtime connects directly to Directus instead, which means realtime is still subject to the original cross-domain cookie problem if you're using `realtimeAuthMode: 'handshake'` or `'strict'`. For `'public'` realtime (no auth), this is fine.
- **Serverless caveats.** On platforms like Vercel functions or Netlify functions, the HTTP proxy works (regular request/response). WebSocket proxying wouldn't work even if we could enable it; those runtimes don't hold persistent connections.

If you need realtime with auth in production-with-proxy, the cleanest answer is usually to put Directus on a subdomain of your app (`api.example.com` and `app.example.com`) with `SESSION_COOKIE_DOMAIN=.example.com`, so cookies are shared without proxying.

## Client IP & `IP_TRUST_PROXY`

When the proxy is on, every request reaches Directus from your **Nuxt server's** IP. The connection is Nuxt to Directus, not browser to Directus. The real client IP travels in the `X-Forwarded-For` header, and the proxy sets it to a single, resolved value rather than blindly forwarding whatever the browser sent. This matters only if your Directus instance uses an IP-based feature:

- Role/policy **IP allow-lists** (`ip_access`)
- **Per-IP rate limiting** (`RATE_LIMITER_*`)
- The client IP recorded in the **activity / audit log**

For Directus to read that header it has to trust the proxy, which it controls with `IP_TRUST_PROXY`:

- **Directus 11 and earlier** defaulted to `IP_TRUST_PROXY=true`; it trusts `X-Forwarded-For` out of the box, so the proxy "just worked".
- **Directus 12+** changed the default to `false` to harden against IP spoofing ([directus#27607](https://github.com/directus/directus/pull/27607)). With the new default, Directus ignores `X-Forwarded-For`, so every proxied request looks like it came from your Nuxt server.

If you run the proxy **and** rely on client IPs on Directus 12+, set it to trust exactly one hop, the SDK proxy:

```bash
# Directus .env
IP_TRUST_PROXY=1
```

Prefer the hop count (`1`) over a blanket `true`. The SDK proxy already strips the attacker-controllable inbound header and forwards a single clean entry, so trusting one hop gives you the real client IP without re-opening the spoofing hole that `true` is prone to. If you stack another proxy in front of your Nuxt app (e.g. Cloudflare to Nuxt to Directus), increase the count to match.

::: tip Direct mode is unaffected
This section only applies when the proxy is enabled. With `proxy: false`, browsers talk to Directus directly and it sees the real client IP from the connection itself; `IP_TRUST_PROXY` then only concerns whatever proxy sits in front of Directus.
:::

::: warning Resolution is only as trustworthy as your edge
The proxy resolves the client IP from the request reaching your Nuxt server. If Nuxt is exposed directly to the internet with no trusted edge in front of it, that value can itself be spoofed. Configure your platform / Nitro trust settings so the incoming IP is trustworthy before relying on it downstream.
:::

## Migration from `devProxy`

The option was renamed from `devProxy` to `proxy` to reflect that it works in production too. The old name still works as an alias:

```ts
// Old (deprecated, still works with a warning)
directus: {
  devProxy: { enabled: true },
}

// New (preferred)
directus: {
  proxy: { enabled: true },
}
```

If both `proxy` and `devProxy` are set, `proxy` wins and `devProxy` is ignored. The runtime config is published under the `proxy` key only, so the deprecated name doesn't leak into your app's runtime.

## See Also

- [Module option: `proxy`](/api/configuration/module#proxy)
- [Module option: `url`](/api/configuration/module#url)
- [Authentication guide: cross-domain setups](/guide/authentication)
