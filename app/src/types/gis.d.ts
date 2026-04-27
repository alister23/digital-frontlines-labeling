// TypeScript declarations for Google Identity Services (accounts.google.com/gsi/client)

interface GisTokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

interface GisTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GisTokenResponse) => void
  error_callback?: (error: unknown) => void
  prompt?: string
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      function initTokenClient(config: GisTokenClientConfig): GisTokenClient
      function revoke(token: string, callback?: () => void): void
    }
  }
}
