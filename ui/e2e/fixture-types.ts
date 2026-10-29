export interface WebhooksHostCall {
	input: { id?: string; secret?: string };
	method: string;
}

export interface WebhooksHostFixture {
	calls: WebhooksHostCall[];
	failNextSecretSave: boolean;
	generatedCount: number;
	holdNextSecretSave: boolean;
	orderLabel: string;
	registryUnavailable: boolean;
	releaseSecretSave: () => void;
	secret: string;
}

declare global {
	interface Window {
		__webhooksHostFixture?: WebhooksHostFixture;
	}
}
