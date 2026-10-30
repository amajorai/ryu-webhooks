// Clipboard helper shared by the Webhooks companion's URL and secret copy buttons.

/** How long the copied checkmark stays before reverting. */
export const COPIED_RESET_MS = 1500;
/** Copy text from the null-origin Companion sandbox, including browsers that
 *  deny navigator.clipboard to opaque origins. The fallback runs synchronously
 *  in the same click gesture, as required by clipboard implementations. */
export async function copyToClipboard(value: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
		return;
	} catch {
		// A sandboxed Companion has a unique opaque origin, so the modern API can
		// reject even after a direct user gesture. Fall through to the legacy
		// gesture-bound copy command before reporting failure.
	}

	const field = document.createElement("textarea");
	field.value = value;
	field.setAttribute("readonly", "");
	field.style.position = "fixed";
	field.style.top = "0";
	field.style.left = "-9999px";
	document.body.append(field);
	field.select();
	field.setSelectionRange(0, field.value.length);
	let copied = false;
	try {
		copied = document.execCommand("copy");
	} finally {
		field.remove();
	}
	if (!copied) {
		throw new Error("Clipboard is unavailable in this browser context.");
	}
}
