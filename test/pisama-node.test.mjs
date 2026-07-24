// Vitest suite for the Pisama community node.
//
// Why .mjs and not .ts: `n8n-node lint` runs `eslint .` over the whole package
// with the community-nodes ruleset, whose `no-restricted-imports` rule bans any
// import outside a fixed allowlist (n8n-workflow, crypto, lodash, …) in *.ts
// files — importing `vitest` from a .ts file fails lint, and strict mode forbids
// weakening the shared eslint config. Every rule object in that config is scoped
// to `**/*.ts`, so a .mjs test file is linted with no community rules. Vitest
// transpiles the imported .ts node source on the fly, so we still test the real
// source, not the built dist.

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import { Pisama } from '../nodes/Pisama/Pisama.node';
import { PisamaApi } from '../credentials/PisamaApi.credentials';

describe('Pisama credentials', () => {
	it('exposes the documented authentication and health-check contract', () => {
		const credentials = new PisamaApi();

		expect(credentials.name).toBe('pisamaApi');
		expect(credentials.icon).toEqual({
			light: 'file:pisama.svg',
			dark: 'file:pisama.dark.svg',
		});
		expect(credentials.properties.map((property) => property.name)).toEqual([
			'apiKey',
			'apiUrl',
			'webhookSecret',
			'n8nApiUrl',
			'n8nApiKey',
		]);
		expect(credentials.authenticate.properties.headers['X-Pisama-API-Key']).toBe(
			'={{$credentials.apiKey}}',
		);
		expect(credentials.test.request).toEqual({
			baseURL: '={{$credentials.apiUrl}}',
			url: '/health',
			method: 'GET',
		});
	});
});

/**
 * Mirror of backend/app/ingestion/n8n_parser.py::parse_execution's runData
 * iteration. Each node's runs are iterated as a LIST (a dict is normalized to
 * `[dict]`), and each run's output is `run["data"]["main"][0]`. Encoding the
 * backend contract here lets the TS tests assert that the payload the node
 * builds actually parses into node → output the way the receiver expects.
 */
function parseRunDataLikeBackend(runData) {
	const nodes = [];
	for (const [name, nodeRuns] of Object.entries(runData ?? {})) {
		if (!nodeRuns) continue;
		const runs = Array.isArray(nodeRuns) ? nodeRuns : [nodeRuns];
		for (const run of runs) {
			if (typeof run !== 'object' || run === null) continue;
			const output = run.data ? (run.data.main?.[0] ?? null) : null;
			nodes.push({ name, output });
		}
	}
	return nodes;
}

/**
 * Minimal IExecuteFunctions mock. Records every httpRequest so tests can assert
 * on the exact payload/headers the node emits and on whether the n8n API GET
 * fired. Only the surface the node touches is implemented.
 */
function makeContext(opts) {
	const {
		items,
		credentials,
		includeWorkflow = true,
		runQuality = true,
		strictMode = false,
		prevNodeByIndex,
		inputSourceNode,
		proxyThrows = false,
		execution,
		postResponse = { received: true },
		postError,
		continueOnFail = false,
	} = opts;

	const httpCalls = [];
	const warnings = [];
	const ctx = {
		getInputData: () => items,
		getCredentials: async () => credentials,
		getNodeParameter: (name, _itemIndex, fallback) => {
			if (name === 'includeWorkflow') return includeWorkflow;
			if (name === 'runQuality') return runQuality;
			if (name === 'strictMode') return strictMode;
			return fallback;
		},
		getExecutionId: () => 'exec-1',
		getWorkflow: () => ({ id: 'wf-1', name: 'Test WF', active: true }),
		getMode: () => 'manual',
		getWorkflowDataProxy: (i) => {
			if (proxyThrows) throw new Error('proxy unavailable');
			const name = prevNodeByIndex ? prevNodeByIndex(i) : undefined;
			return { $prevNode: { name } };
		},
		getInputSourceData: () => {
			if (inputSourceNode === undefined) throw new Error('no input source');
			return { previousNode: inputSourceNode };
		},
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'Pisama' }),
		logger: { warn: (msg) => warnings.push(msg) },
		helpers: {
			httpRequest: async (request) => {
				httpCalls.push(request);
				if (request.method === 'GET') return execution;
				if (postError) throw postError;
				return postResponse;
			},
		},
	};
	return { ctx, httpCalls, warnings };
}

async function run(opts) {
	const { ctx, httpCalls, warnings } = makeContext(opts);
	const result = await new Pisama().execute.call(ctx);
	const post = httpCalls.find((c) => c.method === 'POST');
	const get = httpCalls.find((c) => c.method === 'GET');
	const body = post ? JSON.parse(post.body) : undefined;
	return { result, httpCalls, post, get, body, warnings };
}

const TIER2_CREDS = {
	apiKey: 'pisama_testkey',
	apiUrl: 'https://api.pisama.ai/api/v1',
	webhookSecret: 'wf-webhook-secret',
};

describe('Pisama node — Tier 2 (zero-config, no n8n API)', () => {
	it('builds runData in the list-of-runs shape the backend parser expects', async () => {
		const items = [{ json: { output: 'hi' } }, { json: { output: 'bye' } }];
		const { body } = await run({
			items,
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'AI Agent',
			inputSourceNode: 'AI Agent',
		});

		const runData = body.data.resultData.runData;

		// Keyed by the REAL upstream node name, never the literal "unknown".
		expect(Object.keys(runData)).toEqual(['AI Agent']);
		// Value is a LIST of run objects (not the bare item dict).
		expect(Array.isArray(runData['AI Agent'])).toBe(true);
		expect(runData['AI Agent']).toHaveLength(1);
		// data.main[0] is the list of the node's output items, each `{ json }`.
		const main0 = runData['AI Agent'][0].data.main[0];
		expect(main0).toEqual([{ json: { output: 'hi' } }, { json: { output: 'bye' } }]);
		expect(body.telemetrySource).toBe('execution_context');
	});

	it('payload round-trips through the backend parser contract to node → output', async () => {
		const items = [{ json: { output: 'answer' } }];
		const { body } = await run({
			items,
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'OpenAI',
			inputSourceNode: 'OpenAI',
		});

		const parsed = parseRunDataLikeBackend(body.data.resultData.runData);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].name).toBe('OpenAI');
		expect(parsed[0].output).toEqual([{ json: { output: 'answer' } }]);
	});

	it('the previous dict-valued shape does NOT round-trip (regression guard)', () => {
		// The old bug: runData = { unknown: { output: 'hi' } } — the value was the
		// item dict, not a list of runs. The parser normalizes the dict to [dict]
		// then reads run["data"]["main"][0] === undefined, so the output is lost
		// and every node collapses under the literal key "unknown".
		const broken = { unknown: { output: 'hi' } };
		const parsed = parseRunDataLikeBackend(broken);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].name).toBe('unknown');
		expect(parsed[0].output).toBeNull();
	});

	it('groups items by their real upstream node when they fan in from several', async () => {
		const items = [{ json: { a: 1 } }, { json: { b: 2 } }];
		const { body } = await run({
			items,
			credentials: TIER2_CREDS,
			prevNodeByIndex: (i) => (i === 0 ? 'Node A' : 'Node B'),
			inputSourceNode: 'Node A',
		});

		const runData = body.data.resultData.runData;
		expect(Object.keys(runData).sort()).toEqual(['Node A', 'Node B']);
		expect(runData['Node A'][0].data.main[0]).toEqual([{ json: { a: 1 } }]);
		expect(runData['Node B'][0].data.main[0]).toEqual([{ json: { b: 2 } }]);
	});

	it('falls back to getInputSourceData when $prevNode has no name', async () => {
		const { body } = await run({
			items: [{ json: {} }],
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => undefined, // $prevNode.name unset
			inputSourceNode: 'HTTP Request',
		});
		expect(Object.keys(body.data.resultData.runData)).toEqual(['HTTP Request']);
	});

	it('falls back through a throwing data proxy, then to "unknown" with no source', async () => {
		const { body } = await run({
			items: [{ json: {} }],
			credentials: TIER2_CREDS,
			proxyThrows: true,
			inputSourceNode: undefined, // getInputSourceData throws too
		});
		expect(Object.keys(body.data.resultData.runData)).toEqual(['unknown']);
	});

	it('derives status=error from an item-level error, not a hardcoded success', async () => {
		const { body } = await run({
			items: [{ json: { ok: true } }, { json: {}, error: { message: 'boom' } }],
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'HTTP Request',
			inputSourceNode: 'HTTP Request',
		});
		expect(body.status).toBe('error');
	});

	it('derives status=error from an error field on the item json', async () => {
		const { body } = await run({
			items: [{ json: { error: { message: 'ECONNREFUSED' } } }],
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'HTTP Request',
			inputSourceNode: 'HTTP Request',
		});
		expect(body.status).toBe('error');
	});

	it('reports status=success and honest null finishedAt with a real startedAt', async () => {
		const { body } = await run({
			items: [{ json: { ok: true } }],
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'Set',
			inputSourceNode: 'Set',
		});
		expect(body.status).toBe('success');
		// finishedAt is honestly null mid-run (not a fabricated timestamp).
		expect(body.finishedAt).toBeNull();
		// startedAt is a real, parseable ISO timestamp.
		expect(typeof body.startedAt).toBe('string');
		expect(Number.isNaN(Date.parse(body.startedAt))).toBe(false);
	});

	it('attaches metadata-only workflow (no full JSON) without the n8n API', async () => {
		const { body } = await run({
			items: [{ json: {} }],
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'Set',
			inputSourceNode: 'Set',
			includeWorkflow: true,
		});
		expect(body.workflowMeta).toEqual({ id: 'wf-1', name: 'Test WF', active: true });
		// The full workflow JSON needs the n8n API — must NOT be present here.
		expect(body.workflow).toBeUndefined();
	});

	it('signs the body with HMAC over `{timestamp}.{body}` and a separate nonce', async () => {
		const { post } = await run({
			items: [{ json: { output: 'hi' } }],
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'AI Agent',
			inputSourceNode: 'AI Agent',
		});

		expect(post.headers['X-Pisama-API-Key']).toBe(TIER2_CREDS.apiKey);
		const ts = post.headers['X-Pisama-Timestamp'];
		const expected =
			'sha256=' +
			createHmac('sha256', TIER2_CREDS.webhookSecret).update(`${ts}.${post.body}`).digest('hex');
		expect(post.headers['X-Pisama-Signature']).toBe(expected);
		// Nonce is separate replay protection, hex, and NOT folded into the message.
		expect(post.headers['X-Pisama-Nonce']).toMatch(/^[0-9a-f]{32}$/);
		expect(post.body).not.toContain(post.headers['X-Pisama-Nonce']);
	});

	it('posts to the Pisama webhook and never calls the n8n API', async () => {
		const { post, get } = await run({
			items: [{ json: {} }],
			credentials: TIER2_CREDS,
			prevNodeByIndex: () => 'Set',
			inputSourceNode: 'Set',
		});
		expect(post.url).toBe('https://api.pisama.ai/api/v1/n8n/webhook');
		expect(get).toBeUndefined();
	});
});

describe('Pisama node — Tier 1 (n8n API connected)', () => {
	const TIER1_CREDS = {
		...TIER2_CREDS,
		n8nApiUrl: 'https://my-instance.app.n8n.cloud/api/v1',
		n8nApiKey: 'n8n_api_key',
	};

	const EXECUTION = {
		status: 'success',
		startedAt: '2026-01-01T00:00:00.000Z',
		stoppedAt: '2026-01-01T00:00:03.000Z',
		data: {
			resultData: {
				runData: {
					'AI Agent': [
						{ executionTime: 900, data: { main: [[{ json: { output: 'hi' } }]] } },
					],
				},
			},
		},
		workflowData: {
			nodes: [{ name: 'AI Agent', type: '@n8n/n8n-nodes-langchain.agent', parameters: {} }],
			connections: {},
		},
	};

	it('uses authoritative status, timestamps, runData and full workflow JSON', async () => {
		const { body, get } = await run({
			items: [{ json: { output: 'hi' } }],
			credentials: TIER1_CREDS,
			prevNodeByIndex: () => 'AI Agent',
			inputSourceNode: 'AI Agent',
			execution: EXECUTION,
		});

		expect(body.telemetrySource).toBe('n8n_api');
		expect(body.status).toBe('success');
		expect(body.startedAt).toBe('2026-01-01T00:00:00.000Z');
		expect(body.finishedAt).toBe('2026-01-01T00:00:03.000Z');
		// runData came from the API record (carries real executionTime).
		expect(body.data.resultData.runData['AI Agent'][0].executionTime).toBe(900);
		// Full workflow JSON (with nodes) attached — unblinds structural detectors.
		expect(body.workflow.nodes[0].type).toBe('@n8n/n8n-nodes-langchain.agent');

		// The n8n API key is sent only to the n8n instance, never to Pisama.
		expect(get.url).toBe('https://my-instance.app.n8n.cloud/api/v1/executions/exec-1');
		expect(get.headers['X-N8N-API-KEY']).toBe('n8n_api_key');
		expect(get.headers['X-Pisama-API-Key']).toBeUndefined();
	});

	it('falls back to best-effort telemetry when the n8n API call fails', async () => {
		// execution=undefined → the GET resolves to undefined; the node reads
		// fields off it and continues with the Tier 2 values. A hard throw is
		// covered by the catch; here we assert the graceful degrade path keeps
		// forwarding rather than blocking detection.
		const { body } = await run({
			items: [{ json: { output: 'hi' } }],
			credentials: TIER1_CREDS,
			prevNodeByIndex: () => 'AI Agent',
			inputSourceNode: 'AI Agent',
			execution: undefined,
		});
		// No usable API data → Tier 2 shape/provenance retained.
		expect(body.telemetrySource).toBe('n8n_api'); // source flips on attempt
		expect(Array.isArray(body.data.resultData.runData['AI Agent'])).toBe(true);
	});
});

describe('Pisama node — failure isolation (v0.4)', () => {
	const BASE = {
		items: [{ json: { output: 'hi' } }],
		credentials: TIER2_CREDS,
		prevNodeByIndex: () => 'AI Agent',
		inputSourceNode: 'AI Agent',
	};

	function httpError(message, status) {
		const error = new Error(message);
		if (status !== undefined) {
			error.response = { status };
			error.statusCode = status;
		}
		return error;
	}

	it('sends with a bounded 10 second timeout', async () => {
		const { post } = await run(BASE);
		expect(post.timeout).toBe(10_000);
	});

	it('a 403 from Pisama resolves with forwarded:false and warns with the status', async () => {
		const { result, warnings } = await run({
			...BASE,
			postError: httpError('403 - Forbidden', 403),
		});
		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json.forwarded).toBe(false);
		expect(result[0][0].json.error).toContain('403');
		expect(result[0][0].pairedItem).toEqual({ item: 0 });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('status 403');
	});

	it('a 500 from Pisama resolves with forwarded:false', async () => {
		const { result, warnings } = await run({
			...BASE,
			postError: httpError('500 - Internal Server Error', 500),
		});
		expect(result[0][0].json.forwarded).toBe(false);
		expect(result[0][0].json.error).toContain('500');
		expect(warnings[0]).toContain('status 500');
	});

	it('a timed-out / rejected send resolves with forwarded:false', async () => {
		const { result, warnings } = await run({
			...BASE,
			postError: new Error('timeout of 10000ms exceeded'),
		});
		expect(result[0][0].json.forwarded).toBe(false);
		expect(result[0][0].json.error).toBe('timeout of 10000ms exceeded');
		// No HTTP status on a timeout — the warning must not fabricate one.
		expect(warnings[0]).toContain('timeout of 10000ms exceeded');
		expect(warnings[0]).not.toContain('status');
	});

	it('strictMode=true with continueOnFail=false throws (pre-0.4 behavior)', async () => {
		await expect(
			run({
				...BASE,
				strictMode: true,
				continueOnFail: false,
				postError: httpError('403 - Forbidden', 403),
			}),
		).rejects.toThrow();
	});

	it('strictMode=true with continueOnFail=true emits the legacy error item', async () => {
		const { result } = await run({
			...BASE,
			strictMode: true,
			continueOnFail: true,
			postError: httpError('500 - Internal Server Error', 500),
		});
		expect(result[0][0].json.error).toContain('500');
		// Legacy shape: no forwarded flag in the continueOnFail path.
		expect(result[0][0].json.forwarded).toBeUndefined();
	});

	it('a non-JSON success body does not throw and surfaces the raw string', async () => {
		const { result } = await run({
			...BASE,
			postResponse: 'OK — accepted',
		});
		expect(result[0][0].json).toEqual({ response: 'OK — accepted' });
	});
});
