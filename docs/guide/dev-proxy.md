# Development Proxy

In development, the module creates a proxy at `/directus` that forwards requests from your Nuxt dev server to Directus. This eliminates CORS issues, handles cookie forwarding for session auth, and proxies WebSocket connections for realtime.

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

Browser requests that would normally go to `https://your-directus.com/items/posts` instead go to `http://localhost:3000/directus/items/posts` and the Nuxt dev server forwards them.

The proxy automatically picks up Nuxt's port, including dynamic port changes (3000 → 3001 when you already have a server running).

## Configuration

```typescript
export default defineNuxtConfig({
  directus: {
    devProxy: {
      enabled: true, // default: true in dev, false in prod
      path: '/directus', // HTTP proxy mount path
      wsPath: '/directus-ws', // WebSocket proxy path (for realtime)
    },
  },
})
```

- **`enabled`** (`boolean`, default: `true` in dev, `false` in prod) — turns the proxy on or off.
- **`path`** (`string`, default: `/directus`) — the URL path prefix the proxy mounts under.
- **`wsPath`** (`string`, default: `/directus-ws`) — separate path for WebSocket connections. Kept separate from `path` because the HTTP handler can't also terminate a WebSocket upgrade cleanly.

**Shorthand:** pass a boolean to enable/disable with defaults.

```typescript
export default defineNuxtConfig({
  directus: {
    devProxy: true, // same as { enabled: true }
  },
})
```

```typescript
export default defineNuxtConfig({
  directus: {
    devProxy: false, // disable, use the direct URL even in dev
  },
})
```

## Why It Exists

Three problems it solves:

1. **CORS.** Your Nuxt dev server is on `http://localhost:3000`. Directus is on `https://your-directus.com`. Without the proxy, every browser request is cross-origin and needs CORS headers configured on Directus. With the proxy, requests are same-origin.
2. **Cookies.** Session-based authentication relies on httpOnly cookies. Cookies are scoped to the domain that sets them, so a `Set-Cookie` from Directus wouldn't be honoured by a browser fetching from `localhost`. The proxy rewrites the cookie domain so the cookie is accepted.
3. **WebSockets.** Realtime subscriptions use the WebSocket protocol, which has its own handshake and CORS rules. The `wsPath` proxy handles this with cookie forwarding so auth survives the upgrade.

## Works with Split URLs

If you've set up separate `client` and `server` URLs (for Docker, Kubernetes, or any setup where your Nuxt server reaches Directus via an internal hostname), the dev proxy forwards to the `server` URL and exposes it under the proxy path to the browser. Same-origin for the browser, internal hostname for the backend, no special handling on your end.

See the [`url` option reference](/api/configuration/module#url) for split-URL configuration.

## Disabling the Proxy

If you want browsers to talk to Directus directly even in development (for instance, you've configured CORS on Directus and prefer real URLs in DevTools Network panel), disable the proxy:

```typescript
export default defineNuxtConfig({
  directus: {
    devProxy: false,
  },
})
```

Or disable just the WebSocket proxy by leaving `enabled: true` and setting `wsPath: false` (HTTP proxy on, realtime goes direct).

## Production Behaviour

In production builds the proxy is off by default and all requests go directly to the `client` URL from the browser. This is what most users want: no extra hop, no Nuxt server involvement on every Directus call. For this to work with session auth, cookie domains have to match — either same apex domain or configured correctly. See the [Authentication guide](/guide/authentication) for the cross-domain setup.

### Enabling the proxy in production

Sometimes the direct-from-browser route doesn't work. The most common case is hosting Directus on a different domain than your Nuxt app where you can't (or don't want to) deal with cross-domain cookies — third-party cookie restrictions in modern browsers make this increasingly fragile, especially in staging environments. Turning the proxy on in production puts the session cookie back on your own origin:

```ts
export default defineNuxtConfig({
  directus: {
    url: process.env.NUXT_PUBLIC_DIRECTUS_URL,
    devProxy: { enabled: true }, // or just `devProxy: true`
  },
})
```

With this set, the module registers a Nitro server handler at `/directus/**` in your production build that forwards HTTP requests to Directus, preserving cookies on your own domain.

**Trade-offs to know about:**

- **Extra hop on every Directus call.** Browser → your Nuxt server → Directus instead of browser → Directus. Negligible for occasional calls like login; can add up on data-heavy pages.
- **WebSocket proxy is dev-only.** The realtime proxy uses the Nuxt dev-server's upgrade hook, which doesn't exist in production builds. If you turn the HTTP proxy on in production, realtime connects directly to Directus instead — which means realtime is still subject to the original cross-domain cookie problem if you're using `realtimeAuthMode: 'handshake'` or `'strict'`. For `'public'` realtime (no auth), this is fine.
- **Serverless caveats.** On platforms like Vercel functions or Netlify functions, the HTTP proxy works (regular request/response). WebSocket proxying wouldn't work even if we could enable it — those runtimes don't hold persistent connections.

If you need realtime with auth in production-with-proxy, the cleanest answer is usually to put Directus on a subdomain of your app (`api.example.com` and `app.example.com`) with `SESSION_COOKIE_DOMAIN=.example.com`, so cookies are shared without proxying.

## See Also

- [Module option: `devProxy`](/api/configuration/module#devproxy)
- [Module option: `url`](/api/configuration/module#url)
- [Authentication guide: cross-domain setups](/guide/authentication)
