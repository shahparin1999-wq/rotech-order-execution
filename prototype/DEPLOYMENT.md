# Deployment readiness (documentation only)

**Nothing described here has been done.** No hosting provider has been
selected, configured, or deployed to as part of this change. This document
exists so that whoever owns hosting approval at your organization has the
exact steps to follow once they've made that decision — it is guidance to
hand off, not an action this change took.

## Why nothing was deployed here

This is an internal business tool, even though every value in it is mock
data. Free personal-use tiers of common hosting platforms (for example
Vercel's Hobby tier) restrict use to personal, non-commercial projects in
their terms of service — using one for an internal company tool would not be
compliant, regardless of cost. Whatever hosting is used needs to be approved
for business use, which is an organizational decision, not a technical one.

## Steps once a hosting option is approved

1. **Confirm the hosting option is actually approved for business use**, not
   just "free" or "the one I've used before." Check with whoever owns IT/
   security/vendor approval — ask specifically whether the chosen provider's
   terms permit internal business tools on the tier being used, and whether
   it satisfies your organization's data-handling policy (even though all
   data here is fictional, hosting an internal tool may still fall under
   that policy).
2. **Confirm the repository visibility and access** the hosting provider
   will need — most static/Node hosts deploy by connecting to a GitHub
   repository. Decide who should have access to the deployed URL and whether
   any access restriction (password, allowlist, internal network only) is
   required — the prototype itself has no authentication, so anyone with the
   URL can open it.
3. **Point the deployment at `prototype/` as the application root.** This
   repository is a monorepo — the planning documents live at the root and
   `prototype/` is the actual Next.js app. Most hosts have a "root directory"
   or equivalent monorepo setting.
4. **Use the app's existing build commands** — `npm install` then
   `npm run build`, served via `npm run start` (or the host's equivalent
   Next.js production server integration). No environment variables or
   secrets are required; this app has none.
5. **After deploying, verify from a device that never ran the local dev
   server**: confirm the mock banner is visible, confirm "Reset to sample
   data" works, and confirm the identifier data shown is the fictional demo
   data (order `SAMPLE1001`, customer "Acme Sample Industries") — not
   anything that looks like a real order.
6. **Record the approved hosting decision** somewhere durable (e.g. the
   project's decision log) so it doesn't need re-deciding next time this
   prototype changes.

## What deploying here would not do

Deploying this prototype anywhere does not create shared team state (see
`TEAM_WALKTHROUGH.md` — persistence is per-browser, per-device only), does
not add authentication, and does not move this prototype any closer to the
real project's Gate B domain-implementation authorization. It only makes the
same local demo reachable by URL instead of `npm run dev`.
