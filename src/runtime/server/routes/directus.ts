import { useRuntimeConfig } from '#imports'
import { defineEventHandler, getRequestURL, proxyRequest, setResponseHeaders } from 'h3'
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

  // Proxy the request to Directus
  // Note: WebSocket connections are not supported through this proxy, custom proxy written in module.ts
  await proxyRequest(event, joinURL(directusUrl, path), {
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
