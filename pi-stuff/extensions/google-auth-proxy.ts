/**
 * Example: Google OAuth login -> proxy for LLM calls
 * 
 * Flow:
 * 1. User runs `/login my-app`
 * 2. Browser opens Google OAuth consent screen
 * 3. User approves, gets redirected to your callback URL
 * 4. Your backend exchanges code for tokens, returns them
 * 5. Pi stores tokens, uses access token for all LLM requests
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";

// Your backend URLs
const BACKEND_URL = "https://your-app.example.com";
const OAUTH_AUTHORIZE_URL = `${BACKEND_URL}/auth/google/authorize`;
const OAUTH_TOKEN_URL = `${BACKEND_URL}/auth/google/token`;
const OAUTH_REFRESH_URL = `${BACKEND_URL}/auth/google/refresh`;
const LLM_PROXY_URL = `${BACKEND_URL}/api/llm`;

export default function (pi: ExtensionAPI) {
  pi.registerProvider("my-app", {
    baseUrl: LLM_PROXY_URL,
    api: "anthropic-messages", // or "openai-completions" depending on your proxy
    models: [
      {
        id: "claude-sonnet-4",
        name: "Claude 4 Sonnet",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, // free for users
        contextWindow: 200000,
        maxTokens: 16384,
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
    ],
    oauth: {
      name: "My App (Google Sign-In)",

      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        // Generate state for CSRF protection
        const state = crypto.randomUUID();
        
        // Open browser to your backend's Google OAuth initiation endpoint
        // Your backend redirects to Google's consent screen
        const authUrl = `${OAUTH_AUTHORIZE_URL}?state=${state}`;
        callbacks.onAuth({ url: authUrl });

        // Prompt user for the code they get after OAuth completes
        // Your callback page should display this code
        const code = await callbacks.onPrompt({ 
          message: "Enter the code from the browser:" 
        });

        // Exchange code for tokens via your backend
        const response = await fetch(OAUTH_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Login failed: ${error}`);
        }

        const tokens = await response.json();
        
        return {
          refresh: tokens.refresh_token,
          access: tokens.access_token,
          expires: Date.now() + (tokens.expires_in * 1000),
        };
      },

      async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
        const response = await fetch(OAUTH_REFRESH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: credentials.refresh }),
        });

        if (!response.ok) {
          throw new Error("Token refresh failed - please login again");
        }

        const tokens = await response.json();
        
        return {
          refresh: tokens.refresh_token ?? credentials.refresh,
          access: tokens.access_token,
          expires: Date.now() + (tokens.expires_in * 1000),
        };
      },

      getApiKey(credentials: OAuthCredentials): string {
        // This is sent as Authorization: Bearer <access_token>
        // Your proxy validates this token
        return credentials.access;
      },
    },
  });
}
