# bwl-chatbot

Website chat for brandiwolfelaw.com on Cloudflare Workers.

- `public/widget.js`: the embed. Add to the site footer:
  `<script src="https://<worker-url>/widget.js" defer></script>`
- `src/index.js`: `/config`, `/session`, `/chat` (only answers brandiwolfelaw.com), `/admin` (leads list)
- `src/prompt.js`: bot instructions and lead fields
- `migrations/`: D1 schema (`bwl-chat-leads`)
- `/demo`: test page on the Worker itself

Settings live in `wrangler.jsonc` `vars`. Secrets are set in the Cloudflare dashboard:
`ANTHROPIC_API_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`, and `TURNSTILE_SECRET` if Turnstile is on.
