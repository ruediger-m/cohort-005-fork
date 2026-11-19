# In-app notification providers for Cadence

Research for [#2](https://github.com/ruediger-m/cohort-005-fork/issues/2) (part of map [#1](https://github.com/ruediger-m/cohort-005-fork/issues/1)). Gathered 2026-11-19 from official pricing pages, official docs and the npm registry. Prices and limits change often, so check them again before signing up.

Constraints from the map: hosted only, a free tier we can develop against, a React 19 inbox component or headless hooks, real-time is nice-to-have, and email/push must be possible later. Cadence runs React 19.2 and React Router 8.3.

## Comparison

| | **Knock** | **Novu Cloud** | **Courier** | **MagicBell** | **SuprSend** |
|---|---|---|---|---|---|
| **Free tier** | 10,000 messages/mo, no hard cap [1] | 10,000 workflow runs/mo, Dev + Prod environments, 24 h activity-log retention [6] | 10,000 sends/mo ("Developer") [11] | 1,000 deliveries/mo, 1 project [16] | 10,000 notifications/mo; free inbox shows **SuprSend branding** [20] |
| **First paid step** | Starter $250/mo for 50k, then $0.005/msg [1] | Pro **from $30/mo** for 30k+, then $1.20 per 1k [6] | Business: $0.005 per send for **every** send (10k sends = $50) [11] | Startup $249/mo for 50k, then $0.0025 each [16] | Essentials $100/mo (billed yearly) for 50k, then $2 per 1k [20] |
| **React package** | `@knocklabs/react` 0.15 [24] | `@novu/react` 3.20 [24] | `@trycourier/courier-react` 9.3 [24] | `@magicbell/react` 1.14 (+ `@magicbell/react-headless` 5.5) [24] | `@suprsend/react` 1.6 (+ `@suprsend/react-core` hooks) [24] |
| **Prebuilt + headless** | Both: prebuilt feed/popover, plus hooks [2] | Both: `<Inbox>` and composable parts, plus headless hooks (`@novu/react`, `@novu/js`) [7] | Prebuilt inbox/toast/preferences; `useCourier()` gives the client for custom UI [12] | Prebuilt `Inbox`/`FloatingInbox`; separate headless package [17][24] | Prebuilt `Inbox`/`NotificationFeed`; hooks in `react-core` [21] |
| **React 19** | Peer range `^17‖^18‖^19` (explicit) [24] | Peer range `^18‖^19` (explicit); docs say React 19 is supported [7][24] | Peer `react >=18` (no upper bound; docs only say "18+") [12][24] | No peer range declared; headless needs `>=18.3.1` [24] | Peer `>=16.8`, **but** its dependency `react-timeago@7` peers React ≤18; `npm install` prints ERESOLVE overrides with React 19 [24][25] |
| **Theming** | `--rnf-*` CSS variables, `colorMode` dark, or replace CSS entirely [3] | `appearance` prop: `baseTheme` (dark), `variables`, per-element styles or Tailwind classes; styles scoped, no global leak [8] | Theme objects (`CourierInboxTheme` etc.) or custom renderers [12] | Importable CSS + `--magicbell-*` variables and class selectors [17] | "Many customizable options" (not detailed) [21] |
| **Per-user inbox auth** | "Enhanced security mode": backend signs an **RS256 JWT** (`sub` = user id) with a private signing key; helper `signUserToken` in `@knocklabs/node`; default lifetime 1 h [4] | **HMAC-SHA256(secretKey, subscriberId)** passed as `subscriberHash`; turned on per environment [9] | Backend calls `POST /auth/issue-token` with scope `user_id:<id> inbox:read:messages …`; omitting `expires_in` gives a token that never expires [13] | User **HS256 JWT** signed with project secret, claims `user_external_id` or `user_email` plus `api_key` [18] | "Enhanced security mode": backend signs an **ES256 JWT** (`entity_id`, `exp`, tenant scope); `refreshUserToken` callback [22] |
| **Without auth** | Public key alone can act as any user; docs say turn this on before releasing [4] | Guessable subscriberId exposes another user's inbox [9] | Token always required [13] | Token always required [18] | Public key alone; docs call it insecure for production [22] |
| **Real-time** | Managed websocket (`new-message` event), SDK handles reconnects [5] | Websocket (`socketUrl`, e.g. `wss://eu.socket.novu.co`) [9] | Websocket via `listenForUpdates()` [12] | Websocket ("no polling") [19] | Websocket (socket.io), SDK-managed [23] |
| **Other channels later** | Email, push, SMS, chat [1] | Email, push, SMS, chat [10] | Email, push, SMS, chat [14] | Email, push, Slack, SMS [16][19] | Email, push, SMS, chat [20] |
| **Email through our Postmark** | Yes, Postmark server token; MessageStream override [26] | Yes, Postmark server API token [27] | Yes, "Courier sends through your Postmark account" [28] | **Not listed** (email docs list SES, Mailgun, Ping, SMTP, SendGrid; SMTP may work) [19] | Yes, Postmark server token [29] |
| **Node server SDK** | `@knocklabs/node` 1.41 [24] | `@novu/api` 3.20 [24] | `@trycourier/courier` 10.0 [24] | `magicbell-js` 1.8 [24] | `@suprsend/node-sdk` 1.15 (last release May 2026) [24] |
| **Dev / test mode** | Unlimited environments (Development + Production) with separate keys [1][15] | Development + Production environments on free [6] | Test + Production environments, separate keys and data [15] | Projects (1 on free, 5 on Startup) [16] | Sandbox, Staging, Production workspaces; staging "Test Mode" sends only to testers [23] |
| **Hosting** | Hosted only | Cloud (also open source and self-hostable) | Hosted only | Hosted only | Cloud, BYOC or self-hosted (Enterprise) [23] |
| **EU region** | **Not yet**: "expected by the end of 2026" [15] | **Yes, on Free**: "US + EU data residency" (`eu.api.novu.co`) [6][9] | Yes, but **by request**; new workspaces cannot be created in the EU [15] | Not documented | Each workspace has a data region "including the EU" [23] |

## Notes that matter for Cadence

- **DevUI user switcher.** All five identify users by our own string id (Cadence user id). The browser receives `id + signed token/hash` from a loader. Switching users in the DevUI means re-rendering the provider with the new id and a freshly signed credential. Novu's HMAC is deterministic and never expires, so it is the simplest to sign in a loader. Knock, MagicBell and SuprSend need a JWT with a lifetime. Courier needs a network call to Courier per sign-in.
- **Tests.** No provider offers a local or in-memory mode for the inbox. Server-side triggering can be stubbed behind a small `notify()` module, like the mailer's `.outbox/` fallback. A dedicated dev/test environment with its own keys exists on every plan except MagicBell's free tier.
- **Counting.** Knock bills messages, Novu bills workflow runs, MagicBell counts deliveries per channel (in-app plus email = 2). For a small catalogue of in-app-only Notifications, 10k/month is plenty for development and early production on any of them except MagicBell (1k).
- **Postmark.** Knock, Novu, Courier and SuprSend can all send email through the existing Postmark server token, so moving refund emails onto the provider later would not mean changing the email vendor.

## Recommendation (input for the decision ticket, not the decision)

**Shortlist Novu Cloud first, Knock second.**

Novu Cloud meets every constraint and is the only one with all of these:
1. React 19 declared both in its docs and in its peer range.
2. EU data residency on the free tier.
3. The cheapest paid step: $30/mo, against $100 to $250 for the others.
4. The simplest per-user auth to wire into a loader and the DevUI switcher: HMAC of the user id.
5. Postmark supported.

Watch for:
- The free tier keeps activity logs for only 24 h.
- `subscriberHash` must be enabled in the production environment, or users' inboxes are guessable.

Knock is the polished runner-up:
- Explicit React 19 peer range, good docs, Postmark supported.
- Its RS256 tokens are a stronger auth model.
- But: it jumps from free straight to $250/mo, and it has no EU region yet.

Courier works technically, but:
- The first paid send is billed from zero.
- EU is only by request.
- Inbox tokens need a call to Courier per sign-in.

Not recommended:
- **MagicBell**: 1k free deliveries, no documented Postmark integration, no EU region documented.
- **SuprSend**: its free inbox carries SuprSend branding, and its React package pulls in a dependency that does not declare React 19 support.

## Sources

1. Knock pricing, https://knock.app/pricing
2. Knock React overview, https://docs.knock.app/in-app-ui/react/overview
3. Knock Feed component for React, https://docs.knock.app/in-app-ui/react/feed
4. Knock security and authentication, https://docs.knock.app/in-app-ui/security-and-authentication
5. Knock real-time socket behaviour, https://docs.knock.app/in-app-ui/feeds/socket-behavior
6. Novu pricing, https://novu.co/pricing
7. Novu Inbox overview, https://docs.novu.co/platform/inbox/overview
8. Novu Inbox styling, https://docs.novu.co/platform/inbox/configuration/styling
9. Novu prepare for production (HMAC, EU URLs), https://docs.novu.co/platform/inbox/prepare-for-production
10. Novu integrations, https://docs.novu.co/platform/integrations
11. Courier pricing, https://www.courier.com/pricing
12. Courier React SDK, https://www.courier.com/docs/sdk-libraries/courier-react-web
13. Courier Inbox authentication, https://www.courier.com/docs/platform/inbox/authentication
14. Courier integrations, https://www.courier.com/docs/integrations/overview
15. Knock plans (EU roadmap), https://docs.knock.app/manage-your-account/knock-plans; Courier environments and EU datacenter, https://courier.com/docs/platform/workspaces/environments-api-keys and https://courier.com/docs/platform/workspaces/eu-datacenter
16. MagicBell pricing, https://www.magicbell.com/pricing
17. MagicBell React library, https://www.magicbell.com/docs/libraries/react
18. MagicBell user JWT auth, https://www.magicbell.com/docs/api/authentication/user
19. MagicBell integrations (email providers), https://www.magicbell.com/docs/integrations; in-app channel, https://www.magicbell.com/docs/channels/in_app; inbox product page, https://www.magicbell.com/inbox
20. SuprSend pricing, https://www.suprsend.com/pricing
21. SuprSend React inbox, https://docs.suprsend.com/docs/inbox-react; `@suprsend/react` README on npm
22. SuprSend client authentication, https://docs.suprsend.com/docs/client-authentication
23. What is SuprSend (workspaces, data region, hosting), https://docs.suprsend.com/docs/what-is-suprsend; JS in-app feed, https://docs.suprsend.com/docs/js-inapp-feed
24. npm registry (`npm view <pkg> version peerDependencies dependencies`), checked 2026-11-19
25. Dry-run `npm install react@19.2.7 react-dom@19.2.7 <pkg>` for each inbox package: only `@suprsend/react` printed `ERESOLVE overriding peer dependency` (from `react-timeago@7.2.0`, which peers `react ^16‖^17‖^18`)
26. Knock Postmark integration, https://docs.knock.app/integrations/email/postmark
27. Novu Postmark integration, https://docs.novu.co/platform/integrations/email/postmark
28. Courier Postmark integration, https://www.courier.com/docs/external-integrations/email/postmark
29. SuprSend Postmark integration, https://docs.suprsend.com/docs/postmark
