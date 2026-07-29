# ryu-webhooks

Webhooks for Ryu — the inbound webhook endpoint registry: resolved public URLs, secret presence, last-delivery times, and ingress backend status.

> **The public home of `ryu-webhooks`.** Source, builds, and releases live here —
> binaries for every platform are attached to each release.
>
> This tree is generated from the Ryu monorepo, so commits pushed here
> directly are replaced on the next sync. **Pull requests are welcome** —
> open them here and they are ported into the monorepo, then flow back out.
> Ryu as a whole: https://github.com/amajorai/ryu

## Source & build

This is the **source of record** for the app UI. It imports Ryu's private
`@ryu/ui` design system, so it does **not** build standalone outside the
monorepo — it **builds inside the amajorai/ryu monorepo workspace**.
The **shipped bundle below is the built artifact**: a prebuilt single-file
companion bundle is included at [`dist/webhooks.ui.html`](./dist/webhooks.ui.html) —
the runnable UI Ryu loads for this app.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

# com.ryu.webhooks — Webhooks

The inbound webhook endpoint registry: resolved public URLs, secret presence,
last-delivery times, and the ingress backend status. The observability surface over
Core's webhook ingress (RyuRelay / Composio / per-workflow receivers).

## Parts

- **`ui/` — companion (companion-only app, no backend crate).** A sandboxed
  full-page Companion (Path B, `ui_format: "html"`), built to one self-contained
  `dist/index.html` via `vite-plugin-singlefile`. `Webhooks.tsx` drives Core's
  webhook-registry endpoints through the `window.ryu` bridge — no direct `fetch`,
  no node token in the sandbox — listing registered endpoints, their public URLs,
  whether a signing secret is set, and last-delivery timestamps.

There is no dedicated backend crate or sidecar: webhook ingress, URL resolution, and
delivery bookkeeping live in Core; this app is only the surface.

## Manifest (`manifest.json`)

- **Capability grant:** `webhooks:crud` — the bridge capability the companion calls.
- **Runnable:** one `companion` (`Webhooks`, icon `webhook`).

## Surfaces as

A companion route in the shell (label **Webhooks**). It reports the resolved public
ingress URL and per-endpoint secret/delivery state so a user can wire external
producers to a node.
