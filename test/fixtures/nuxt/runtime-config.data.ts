export interface RuntimeConfigOverrides {
  url?: string | { client: string, server: string }
  directusUrl?: string
  serverDirectusUrl?: string
  proxy?: boolean | { enabled: boolean, path?: string, wsPath?: string }
}

export function makeRuntimeConfig(overrides: RuntimeConfigOverrides) {
  return {
    public: {
      directus: {
        url: overrides.url ?? 'https://public.example.com',
        directusUrl: overrides.directusUrl,
        proxy: overrides.proxy ?? false,
      },
    },
    directus: {
      serverDirectusUrl: overrides.serverDirectusUrl,
    },
  }
}
