import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PisamaApi implements ICredentialType {
	name = 'pisamaApi';
	displayName = 'Pisama API';
	icon = 'file:pisama.svg' as const;
	documentationUrl = 'https://docs.pisama.ai/guides/integrations/n8n';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Pisama key for the server named in API URL. Pisama for n8n cloud: an ingest key from Settings at app.n8n.pisama.ai (starts with pn8n_). Pisama platform: a key from pisama.ai/settings/api-keys (starts with pisama_). Self-hosted server: the PISAMA_API_KEY value.',
		},
		{
			displayName: 'API URL',
			name: 'apiUrl',
			type: 'string',
			default: 'https://api.pisama.ai/api/v1',
			description:
				'Pisama API base URL. Pisama platform: https://api.pisama.ai/api/v1 (the default). Pisama for n8n cloud: https://pisama-n8n-cloud.fly.dev/api/v1. Self-hosted server: http://your-server:8400/api/v1.',
		},
		{
			displayName: 'Webhook Secret',
			name: 'webhookSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'HMAC secret for signing payloads. Required by the Pisama platform (api.pisama.ai), which issues it when you register the workflow and rejects unsigned executions. Pisama for n8n cloud: leave empty (the ingest key authenticates on its own). Self-hosted server: set to PISAMA_WEBHOOK_SECRET to enforce signatures, or leave empty to authenticate by API key alone.',
		},
		{
			displayName: 'n8n API URL',
			name: 'n8nApiUrl',
			type: 'string',
			default: '',
			placeholder: 'https://your-instance.app.n8n.cloud/api/v1',
			description:
				'Optional. Base URL of your n8n public REST API. When set (with an API key), the node fetches authoritative execution status, real start/finish timestamps, per-node run data, and the full workflow JSON — the only source that unblinds the structural quality checks. Leave empty to send best-effort telemetry from the node execution context.',
		},
		{
			displayName: 'n8n API Key',
			name: 'n8nApiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional. n8n public API key (Settings → n8n API). Sent as X-N8N-API-KEY only to the n8n API URL above, never to Pisama. Enables authoritative, full-fidelity execution telemetry.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Pisama-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiUrl}}',
			url: '/health',
			method: 'GET',
		},
	};
}
