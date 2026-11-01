// Endpoint URL row, copy button, and metadata badges for the Webhooks companion.

import {
	AlertCircleIcon,
	Copy01Icon,
	SquareLock01Icon,
	SquareUnlock01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { sandboxSileo as sileo } from "@ryu/ui/components/sandbox-toast.ts";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import type { WebhookEndpoint } from "./types.ts";
import { COPIED_RESET_MS, copyToClipboard } from "./Webhooks-clipboard.ts";

/** A copy-to-clipboard button for a reachable public URL (disabled when null). */
export function CopyUrlButton({ url }: { url: string | null }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		if (!url) {
			return;
		}
		try {
			await copyToClipboard(url);
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
export function PublicUrlRow({ endpoint }: { endpoint: WebhookEndpoint }) {
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
export function EndpointMeta({ endpoint }: { endpoint: WebhookEndpoint }) {
	const tl = useLiteralMessages();
	return (
		<div className="flex flex-wrap items-center gap-2">
			{endpoint.hasSecret ? (
				<Badge variant="secondary">
					<HugeiconsIcon className="size-3" icon={SquareLock01Icon} />
					Secret set
				</Badge>
			) : (
				<Badge variant="outline">
					<HugeiconsIcon className="size-3" icon={SquareUnlock01Icon} />
					No secret
				</Badge>
			)}
			{endpoint.kind === "composio" && endpoint.subscriptionCount !== null && (
				<Badge variant="outline">
					{tl(
						"{count, plural, one {{countText} subscription} other {{countText} subscriptions}}",
						{
							count: endpoint.subscriptionCount,
							countText: String(endpoint.subscriptionCount),
						}
					)}
				</Badge>
			)}
			<span className="text-muted-foreground text-xs">
				{endpoint.lastDelivery
					? tl("Last delivery {when}", {
							when: formatDistanceToNow(
								new Date(endpoint.lastDelivery * 1000),
								{
									addSuffix: true,
								}
							),
						})
					: "No deliveries yet"}
			</span>
		</div>
	);
}
