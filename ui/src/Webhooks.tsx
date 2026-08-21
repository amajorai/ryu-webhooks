// The Webhooks companion (Path B, ui_format:"html"). PORTED VERBATIM from the
// desktop `apps/desktop/src/pages/WebhooksPage.tsx`: same @ryu/ui components, same
// layout, same helper component tree, same classNames, same empty/loading/error
// states. ONLY the data layer changed — the shell-only hooks (`useActiveNode` +
// the direct `fetchWebhooks`/`fetchWebhookIngressStatus` clients, `@tanstack/
// react-query`, `sileo`) are replaced by their sandbox equivalents (the
// `window.ryu.webhooks` bridge + local query/sileo shims), so the rendered UI is
// indistinguishable from the desktop page.
//
// Consumes Core's unified webhook registry and explicit secret routes:
//   - GET /api/webhook-ingress/status → the header banner (backend + overall URL)
//   - GET /api/webhooks               → the endpoint list (composio + workflows)
//   - GET/POST /api/webhooks/:id/secret → protected read, save, or generation
//
// The whole point: show the RESOLVED PUBLIC URL a user pastes into an external
// service (Stripe, GitHub, Composio, …), never a localhost URL. Every URL shown
// comes from a server field; a `null` publicUrl renders an honest "no reachable
// URL yet" state (ingress not up, or a workflow path under the non-addressable
// managed RyuRelay) with the copy button disabled — we never fabricate a URL.

import {
	AlertCircleIcon,
	CheckmarkCircle02Icon,
	Copy01Icon,
	RefreshIcon,
	SquareLock01Icon,
	SquareUnlock01Icon,
	Tick01Icon,
	WebhookIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@ryu/ui/components/empty.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Label } from "@ryu/ui/components/label.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import {
	fetchWebhookIngressStatus,
	fetchWebhookSecret,
	fetchWebhooks,
	setWebhookSecret,
} from "./bridge.ts";
import { useQuery } from "./query.ts";
import { sileo } from "./sileo.ts";
import type { WebhookEndpoint } from "./types.ts";

/** How long the copied checkmark stays before reverting. */
const COPIED_RESET_MS = 1500;

/** Background poll interval — refresh the registry + ingress status silently. */
const POLL_MS = 15_000;

/** A copy-to-clipboard button for a reachable public URL (disabled when null). */
function CopyUrlButton({ url }: { url: string | null }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		if (!url) {
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			sileo.success({ title: "Public URL copied" });
			setTimeout(() => setCopied(false), COPIED_RESET_MS);
		} catch {
			sileo.error({ title: "Copy failed" });
		}
	};

	return (
		<Button
			aria-label="Copy public URL"
			disabled={!url}
			onClick={copy}
			size="icon"
			variant="ghost"
		>
			<HugeiconsIcon
				className="size-4"
				icon={copied ? Tick01Icon : Copy01Icon}
			/>
		</Button>
	);
}

/** The resolved public URL row: the reachable URL + copy, or an honest empty. */
function PublicUrlRow({ endpoint }: { endpoint: WebhookEndpoint }) {
	if (endpoint.publicUrl) {
		return (
			<div className="flex items-center gap-2">
				<code
					className="min-w-0 flex-1 select-all truncate rounded bg-muted px-2 py-1 font-mono text-xs"
					title={endpoint.publicUrl}
				>
					{endpoint.publicUrl}
				</code>
				<CopyUrlButton url={endpoint.publicUrl} />
			</div>
		);
	}
	return (
		<div className="flex items-center gap-2 rounded border border-dashed px-2 py-1.5">
			<HugeiconsIcon
				className="size-4 shrink-0 text-muted-foreground"
				icon={AlertCircleIcon}
			/>
			<p className="text-muted-foreground text-xs">
				{endpoint.kind === "workflow"
					? "No reachable URL yet — the ingress is still registering. The managed relay routes per-workflow paths once it connects; a tunnel backend (Cloudflared / Tailscale / own relay) also works."
					: "No reachable URL yet — configure webhook ingress to receive deliveries."}
			</p>
		</div>
	);
}

/** Secret / last-delivery / subscription metadata badges for one endpoint. */
function EndpointMeta({ endpoint }: { endpoint: WebhookEndpoint }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{endpoint.hasSecret ? (
				<Badge className="gap-1" variant="secondary">
					<HugeiconsIcon className="size-3" icon={SquareLock01Icon} />
					Secret set
				</Badge>
			) : (
				<Badge className="gap-1" variant="outline">
					<HugeiconsIcon className="size-3" icon={SquareUnlock01Icon} />
					No secret
				</Badge>
			)}
			{endpoint.kind === "composio" && endpoint.subscriptionCount !== null && (
				<Badge variant="outline">
					{endpoint.subscriptionCount} subscription
					{endpoint.subscriptionCount === 1 ? "" : "s"}
				</Badge>
			)}
			<span className="text-muted-foreground text-xs">
				{endpoint.lastDelivery
					? `Last delivery ${formatDistanceToNow(
							new Date(endpoint.lastDelivery * 1000),
							{ addSuffix: true }
						)}`
					: "No deliveries yet"}
			</span>
		</div>
	);
}

/**
 * Protected secret editor. The value is loaded only through the explicit secret
 * route, never as part of the registry refresh. It uses normal text styling (not
 * code or a monospace face) while keeping the workspace/user-id-style blur until
 * the field is hovered or focused.
 */
function SecretEditor({
	endpoint,
	onChanged,
}: {
	endpoint: WebhookEndpoint;
	onChanged: () => void;
}) {
	const secretQuery = useQuery({
		queryKey: ["webhooks", "secret", endpoint.id, endpoint.hasSecret],
		queryFn: () =>
			endpoint.hasSecret
				? fetchWebhookSecret(endpoint.id)
				: Promise.resolve(null),
	});
	const [secret, setSecret] = useState("");
	const [saving, setSaving] = useState(false);
	const [copied, setCopied] = useState(false);
	const fieldId = `webhook-secret-${encodeURIComponent(endpoint.id)}`;

	useEffect(() => {
		if (secretQuery.data !== undefined) {
			setSecret(secretQuery.data ?? "");
		}
	}, [secretQuery.data]);

	const persist = async (requested?: string) => {
		setSaving(true);
		try {
			const nextSecret = await setWebhookSecret(endpoint.id, requested);
			setSecret(nextSecret);
			sileo.success({
				title:
					requested === undefined
						? "New webhook secret generated"
						: "Webhook secret saved",
			});
			onChanged();
		} catch {
			sileo.error({ title: "Couldn't save webhook secret" });
		} finally {
			setSaving(false);
		}
	};

	const copy = async () => {
		if (!secret) {
			return;
		}
		try {
			await navigator.clipboard.writeText(secret);
			setCopied(true);
			sileo.success({ title: "Webhook secret copied" });
			setTimeout(() => setCopied(false), COPIED_RESET_MS);
		} catch {
			sileo.error({ title: "Copy failed" });
		}
	};

	const loading = endpoint.hasSecret && secretQuery.isLoading;

	return (
		<div className="flex flex-col gap-2 border-t pt-3">
			<Label htmlFor={fieldId}>Signing secret</Label>
			<div className="flex items-center gap-2">
				<Input
					aria-label={`Signing secret for ${endpoint.label}`}
					className="min-w-0 flex-1 text-sm transition-[filter] duration-150 [filter:blur(5px)] hover:[filter:blur(0)] focus-visible:[filter:blur(0)]"
					disabled={loading || saving}
					id={fieldId}
					onChange={(event) => setSecret(event.target.value)}
					placeholder={
						endpoint.hasSecret
							? "Configured — hover or focus to reveal"
							: "No secret yet — generate one"
					}
					type="text"
					value={secret}
				/>
				<Button
					aria-label="Copy signing secret"
					disabled={!secret || loading || saving}
					onClick={copy}
					size="icon"
					variant="ghost"
				>
					<HugeiconsIcon
						className="size-4"
						icon={copied ? Tick01Icon : Copy01Icon}
					/>
				</Button>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					disabled={loading || saving}
					onClick={() => persist()}
					size="sm"
					variant="outline"
				>
					<HugeiconsIcon className="mr-1.5 size-4" icon={RefreshIcon} />
					{endpoint.hasSecret ? "Generate new" : "Generate"}
				</Button>
				<Button
					disabled={loading || saving || secret.trim().length === 0}
					onClick={() => persist(secret.trim())}
					size="sm"
				>
					Save
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">
				Hidden by default. Hover or focus to reveal it. Generate creates a
				secure server-side value; custom secrets must be at least 16 characters.
				Use the same value in the sender's signing settings.
			</p>
			{secretQuery.isError && endpoint.hasSecret && (
				<p className="text-destructive text-xs">
					The existing secret could not be loaded. You can generate a
					replacement.
				</p>
			)}
		</div>
	);
}

/** One endpoint card: label, kind, listen path, resolved public URL, metadata. */
function EndpointCard({
	endpoint,
	onChanged,
}: {
	endpoint: WebhookEndpoint;
	onChanged: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<HugeiconsIcon
						className="size-4 shrink-0 text-muted-foreground"
						icon={WebhookIcon}
					/>
					<span className="truncate font-medium text-sm">{endpoint.label}</span>
				</div>
				<Badge variant="outline">{endpoint.kind}</Badge>
			</div>
			<div>
				<p className="mb-1 text-muted-foreground text-xs">Public URL</p>
				<PublicUrlRow endpoint={endpoint} />
			</div>
			<div className="flex items-center gap-2">
				<span className="text-muted-foreground text-xs">Path</span>
				<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
					{endpoint.path}
				</code>
			</div>
			<EndpointMeta endpoint={endpoint} />
			<SecretEditor endpoint={endpoint} onChanged={onChanged} />
		</div>
	);
}

export function Webhooks() {
	const status = useQuery({
		queryKey: ["webhooks", "ingress-status"],
		queryFn: () => fetchWebhookIngressStatus(),
		refetchInterval: POLL_MS,
	});
	const registry = useQuery({
		queryKey: ["webhooks", "registry"],
		queryFn: () => fetchWebhooks(),
		refetchInterval: POLL_MS,
	});

	const refresh = () => {
		status.refetch();
		registry.refetch();
	};

	const up = status.data?.up ?? false;
	const endpoints = registry.data?.endpoints ?? [];

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<div className="flex items-start justify-between gap-4 border-b p-6">
				<div>
					<h1 className="font-semibold text-lg">Webhooks</h1>
					<p className="text-muted-foreground text-sm">
						Inbound webhook endpoints on this node and the public URLs to paste
						into external services.
					</p>
				</div>
				<Button
					disabled={status.isFetching || registry.isFetching}
					onClick={refresh}
					size="sm"
					variant="outline"
				>
					<HugeiconsIcon className="mr-1.5 size-4" icon={RefreshIcon} />
					Refresh
				</Button>
			</div>

			<div className="flex flex-col gap-4 p-6">
				{/* Ingress status banner — the overall backend + reachable base URL. */}
				{status.data && (
					<div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
						<div className="flex items-center gap-2">
							<HugeiconsIcon
								className={`size-4 ${up ? "text-emerald-500" : "text-amber-500"}`}
								icon={up ? CheckmarkCircle02Icon : AlertCircleIcon}
							/>
							<span className="font-medium text-sm">
								{up ? "Ingress ready" : "Ingress not configured"}
							</span>
							<Badge variant="outline">{status.data.kind || "unknown"}</Badge>
						</div>
						{up && status.data.publicUrl ? (
							<div className="flex items-center gap-2">
								<code
									className="min-w-0 flex-1 select-all truncate rounded bg-muted px-2 py-1 font-mono text-xs"
									title={status.data.publicUrl}
								>
									{status.data.publicUrl}
								</code>
								<CopyUrlButton url={status.data.publicUrl} />
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								No public URL is resolved yet, so external services can't reach
								this node's webhooks. Configure a tunnel or relay backend
								(Cloudflared, Tailscale Funnel, or your own relay) to get a
								reachable URL.
							</p>
						)}
					</div>
				)}

				{/* Endpoint list — loading / error / content. */}
				{registry.isLoading && (
					<div className="flex items-center justify-center py-12">
						<Spinner />
					</div>
				)}
				{registry.isError && !registry.isLoading && (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Couldn't load webhooks</EmptyTitle>
							<EmptyDescription>
								The webhook registry didn't load. Check that this node is
								reachable and try again.
							</EmptyDescription>
						</EmptyHeader>
						<Button onClick={refresh} size="sm" variant="outline">
							Retry
						</Button>
					</Empty>
				)}
				{registry.data && !registry.isLoading && endpoints.length === 0 && (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>No webhook endpoints</EmptyTitle>
							<EmptyDescription>
								No inbound webhook receivers are registered on this node yet.
								Add a Composio trigger or a workflow with a webhook trigger to
								see it here.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
				{endpoints.length > 0 && (
					<div className="flex flex-col gap-3">
						{endpoints.map((endpoint) => (
							<EndpointCard
								endpoint={endpoint}
								key={endpoint.id}
								onChanged={refresh}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
