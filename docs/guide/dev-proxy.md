---
title: Dev Proxy (moved)
description: This page has moved to /guide/proxy.
---

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // Client-side redirect for users who hit the old URL.
  window.location.replace('/guide/proxy')
})
</script>

# Dev Proxy → Proxy

This page has moved to **[/guide/proxy](/guide/proxy)**. The option was renamed from `devProxy` to `proxy` to reflect that it works in production builds too. You'll be redirected automatically.

See the [migration section](/guide/proxy#migration-from-devproxy) for details.
