# Security

## Authorisation is never a role check

Forbidden anywhere in this codebase:

```js
if (user.role === 'CM') { … }        // ✗
```

The model is:

```
User → Role → Permission Set → Scope → Action
```

`auth.js` defines three permission sets. The dispatcher in `index.js` checks
`auth.can(claims, permission)` **before** the handler runs; handlers then
re-check `auth.inScope(claims, departmentId)` against the specific resource.
Two independent gates, both server-side.

## Visibility ≠ authority

`WAR_ROOM` holds `dashboard:executive`, `redflag:investigate` and
`directive:draft`, and deliberately does **not** hold `directive:issue`. The
analyst sees every department in the state and is refused when they try to act.

The client hides the directive form for that role, but that is a clarity
measure. The server returns `403` whether or not the form was rendered — proven
by `tests/engine.test.js` and reproducible with curl:

```bash
curl -X POST .../directives -H "Authorization: Bearer <warroom token>" …
# 403 FORBIDDEN — "Your role does not hold \"directive:issue\"."
```

## Scope isolation

A user with `scope.type === 'DEPARTMENT'` sees only their department IDs.
`GET /dashboard` filters departments before scoring, so an out-of-scope
department cannot leak through an aggregate. `GET /complaints/:id` returns `403`
rather than `404` for an in-existence but out-of-scope record, since the caller
is authenticated and the distinction is not sensitive here.

## Sessions

HMAC-SHA256 signed tokens via `node:crypto`, carrying `sub`, `role`,
`permissions`, `scope`, `iat`, `exp`. Signature comparison uses
`timingSafeEqual`. Default TTL 8 hours. A tampered signature fails verification
(asserted in tests).

## Secrets

Nothing is committed. `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
`ZOHO_REFRESH_TOKEN` and `AUTH_SIGNING_KEY` come from Catalyst environment
variables. The client bundle contains no credential — every Zoho call goes
through the function, and the browser never sees a Zoho token.

## Input handling

Every route validates what it reads and ignores what it does not expect.
Identifiers are only ever used as path segments against the Zoho API, never
interpolated into a query language. Request bodies are capped at 256KB. All
user-supplied strings are escaped on render (`esc()` in `app.js`); the client
never uses `innerHTML` with unescaped input.

## PII

Complaints carry a pseudonymous `citizen_ref` (`TN-000101`) and no identity
fields. There is no bulk export endpoint.

---

## Known gaps — stated, not implied

These are real and would need closing before this is anything more than a demo:

1. **Hand-rolled auth.** Three accounts with in-source passwords and a
   hand-written token format, because no package registry was available in the
   build environment. Replace with **Catalyst Authentication**, and require MFA
   for any account holding `directive:issue`.
2. **No audit log.** Directive issuance returns an audit envelope in the
   response but does not persist an append-only record. A `cm_audit` custom
   module with hash-chained entries is the intended fix.
3. **No rate limiting.** In-process token buckets on login and write endpoints
   are the minimum; Catalyst API gateway rules are the better answer.
4. **Single shared Zoho identity.** Every call uses the portal owner's refresh
   token, so Zoho-side audit trails attribute all activity to one account.
   Per-user OAuth would carry the acting officer's identity into Zoho.
5. **CORS is open** (`Access-Control-Allow-Origin: *`) to keep the demo
   deployable from any Slate URL. Pin it to the deployed origin.
