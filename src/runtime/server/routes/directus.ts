import { useRuntimeConfig } from '#imports'
import { defineEventHandler, getRequestIP, getRequestURL, proxyRequest, setResponseHeaders } from 'h3'
import { joinURL } from 'ufo'
import { rewriteProxiedSetCookie } from './directus-cookie'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const serverUrl = config.directus?.serverDirectusUrl
  const directusUrl = serverUrl || config.public.directus.directusUrl

  // Get the full URL path with query string
  const url = getRequestURL(event)
  const path = url.pathname.replace(/^\/directus/, '') + url.search

  // Whether the request reaching us is HTTPS. We preserve Secure/SameSite=None
  // on HTTPS (production, staging) and downgrade only on HTTP (localhost dev).
  const isHttps = url.protocol === 'https:'

  // Normalise the forwarded client IP.
  //
  // h3's proxy forwards the *inbound* `X-Forwarded-For` verbatim. That header is
  // attacker-controllable, so a downstream Directus configured to trust it
  // (`IP_TRUST_PROXY`) could be tricked into believing a spoofed client IP and
  // bypass IP allow-lists / per-IP rate limits. We instead resolve the client IP
  // at *this* hop and forward it as a single, clean entry, so Directus can safely
  // trust exactly one proxy hop (`IP_TRUST_PROXY=1`).
  //
  // Backwards compatible: a Directus on the pre-12 default (`IP_TRUST_PROXY=true`,
  // which reads the left-most XFF entry) resolves this single value to the same
  // client IP it would have before — so existing/un-upgraded deployments keep
  // working unchanged. The resolution is only as trustworthy as this app's own
  // edge: if Nuxt sits directly on the internet, set your platform/Nitro trust
  // config so `getRequestIP` can't be spoofed.
  const clientIp = getRequestIP(event, { xForwardedFor: true })
  const forwardedHeaders = clientIp ? { 'x-forwarded-for': clientIp } : {}

  // Proxy the request to Directus
  // Note: WebSocket connections are not supported through this proxy, custom proxy written in module.ts
  await proxyRequest(event, joinURL(directusUrl, path), {
    headers: forwardedHeaders,
    onResponse(proxyEvent, response) {
      const setCookieHeaders = response.headers.getSetCookie?.() || []

      if (setCookieHeaders.length > 0) {
        const rewrittenCookies = setCookieHeaders.map(cookie =>
          rewriteProxiedSetCookie(cookie, { isHttps }),
        )

        setResponseHeaders(proxyEvent, {
          'set-cookie': rewrittenCookies,
        })
      }
    },
  })
})
