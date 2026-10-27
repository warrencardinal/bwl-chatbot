# bwl-chatbot

Website chat for brandiwolfelaw.com on Cloudflare Workers.

- `public/widget.js`: the embed. Add to the site footer:
  `<script src="https://chat.brandiwolfe.com/widget.js" defer></script>` (optional: `data-delay="8"` seconds before the greeting bubble, `0` to turn it off; `data-color="#40085e"`)
- `src/index.js`: `/config`, `/session`, `/chat` (only answers brandiwolfelaw.com), `/admin` (leads list)
- `src/prompt.js`: bot instructions and lead fields
- `src/booking.js`, `src/google.js`: uncontested-divorce booking against Brandi's Google Calendar (service account)
- `/admin/availability`: days, hours and booking rules
- `/admin/alerts`: who gets lead and booking emails (`src/alerts.js`)
- `/admin/reports`: leads and bookings by channel, landing page, chat page, matter, campaign (`src/reports.js`, `src/source.js`)
- `/admin/tests`: runs the scripted conversations in `src/tests.js` against the live bot and grades them. Run after any change to `src/prompt.js`.
- `migrations/`: D1 schema (`bwl-chat-leads`)
- `/demo`: test page on the Worker itself

Settings live in `wrangler.jsonc` `vars`. Secrets are set in the Cloudflare dashboard:
`ANTHROPIC_API_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `GOOGLE_SERVICE_ACCOUNT` (full JSON key), and `TURNSTILE_SECRET` if Turnstile is on.

Migrations are applied to D1 by hand (Workers Builds only deploys).
