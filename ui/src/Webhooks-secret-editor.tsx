// Signing-secret editors (protected workflow secret, managed Composio secret)
// for the Webhooks companion.

import {
	Copy01Icon,
	RefreshIcon,
	SquareLock01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Label } from "@ryu/ui/components/label.tsx";
import { sandboxSileo as sileo } from "@ryu/ui/components/sandbox-toast.ts";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useEffect, useState } from "react";
import { fetchWebhookSecret, setWebhookSecret } from "./bridge.ts";
import type { WebhookEndpoint } from "./types.ts";
import { COPIED_RESET_MS, copyToClipboard } from "./Webhooks-clipboard.ts";

/**
 * Protected secret editor. The value is loaded only through the explicit secret
 * route, never as part of the registry refresh. It uses normal text styling (not
 * code or a monospace face) while keeping the workspace/user-id-style blur until
 * the field is hovered or focused.
 */
export function SecretEditor({
	endpoint,
	onChanged,
}: {
	endpoint: WebhookEndpoint;
	onChanged: () => void;
}) {
	const tl = useLiteralMessages();
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
			await copyToClipboard(secret);
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
			<div className="flex items-center gap-2" data-secret-field>
				<Input
					aria-label={tl("Signing secret for {label}", {
						label: endpoint.label,
					})}
					className="min-w-0 flex-1"
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
				<p className="text-status-destructive text-xs">
					The existing secret could not be loaded. You can generate a
					replacement.
				</p>
			)}
		</div>
	);
}

export function ManagedComposioSecret({ configured }: { configured: boolean }) {
	return (
		<div className="flex flex-col gap-2 border-t pt-3">
			<Label>Signing secret</Label>
			<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
				<HugeiconsIcon
					className="size-4 shrink-0 text-muted-foreground"
					icon={SquareLock01Icon}
				/>
				<span className="text-sm">
					{configured ? "Managed by Composio" : "Waiting for trigger setup"}
				</span>
			</div>
			<p className="text-muted-foreground text-xs">
				Ryu syncs the project webhook URL and signing secret when you save a
				Composio trigger. No manual secret setup is needed here.
			</p>
		</div>
	);
}
