# n8n-nodes-pisama

[![CI](https://github.com/Pisama-AI/n8n-nodes-pisama/actions/workflows/ci.yml/badge.svg)](https://github.com/Pisama-AI/n8n-nodes-pisama/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/n8n-nodes-pisama.svg)](https://www.npmjs.com/package/n8n-nodes-pisama)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An n8n community node that forwards workflow executions to [Pisama](https://pisama.ai) for failure detection and self-healing.

Without this node, integrating n8n with Pisama requires wiring an HTTP Request node by hand, computing HMAC signatures yourself, and shaping the payload to match the Pisama webhook contract. With this node, you drop "Pisama" on any workflow, authenticate once, and every subsequent execution is analyzed.

## What Pisama detects in n8n workflows

- Structural: cycles, missing error handlers, schema mismatches between nodes, excessive branching. These read the full workflow JSON, which requires the optional n8n API connection (see below).
- Runtime: token/cost budget overruns, AI node timeouts, unprotected LLM calls, resource exhaustion
- Semantic (when LLM nodes are present): loops, hallucinations, context neglect, coordination breakdown across sub-agents

See [docs.pisama.ai/guides/integrations/n8n](https://docs.pisama.ai/guides/integrations/n8n) for the full detector list.

## Install

In n8n's community nodes settings, enter `n8n-nodes-pisama` and install. Restart n8n. The Pisama node will appear in the node picker.

The package supports Node.js 20 or newer and follows n8n's strict community-node
validation rules. Release history is recorded in
[CHANGELOG.md](https://github.com/Pisama-AI/n8n-nodes-pisama/blob/main/CHANGELOG.md).

## Configure

The node talks to whichever Pisama server you use. Pick your column, then create the
credential in n8n (Credentials, New, Pisama API):

| Credential field | Pisama for n8n cloud ([app.n8n.pisama.ai](https://app.n8n.pisama.ai)) | Pisama platform ([pisama.ai](https://pisama.ai)) | Self-hosted [pisama-n8n](https://github.com/Pisama-AI/pisama-n8n) server |
|---|---|---|---|
| API Key | Ingest key from Settings (starts with `pn8n_`) | Key from [pisama.ai/settings/api-keys](https://pisama.ai/settings/api-keys) (starts with `pisama_`) | Your `PISAMA_API_KEY` value |
| API URL | `https://pisama-n8n-saas.fly.dev/api/v1` | `https://api.pisama.ai/api/v1` (default) | `http://your-server:8400/api/v1` |
| Webhook Secret | Leave empty | Required: register the workflow in Pisama to obtain it (unsigned executions are rejected) | Optional: set to `PISAMA_WEBHOOK_SECRET` to enforce HMAC, or leave empty |

The credential Test button checks `{API URL}/health` and validates green against all
three servers.

## Use

Add a Pisama node at the end of any workflow whose executions you want analyzed. Set Operation to "Send Execution". No other config needed.

The node ships real execution status, real start/finish timestamps, per-node run data, and (optionally) the full workflow definition. Analysis runs in the background on Pisama's side, so the node returns immediately.

## Telemetry fidelity: connect the n8n API (recommended)

A community node runs *inside* the execution it is reporting on, so from the node context alone it cannot see the execution's final status, its real duration, the run data of every node, or the full workflow JSON. Without extra configuration the node sends an honest best-effort view: real ids and metadata, a real node-run window, and a status derived from observed upstream errors.

For **authoritative** telemetry, connect your n8n public REST API in the Pisama credential:

1. In n8n: Settings → n8n API → create an API key.
2. In the Pisama credential, set **n8n API URL** (e.g. `https://your-instance.app.n8n.cloud/api/v1`) and **n8n API Key**.

With the API connected, the node fetches the execution record (`GET /executions/{id}?includeData=true`) and forwards the real `status`, `startedAt`/`stoppedAt`, full per-node run data, and the full workflow JSON that the structural detectors and quality assessment depend on. The n8n API key is sent only to your n8n instance, never to Pisama. The `telemetrySource` field on each payload records whether it came from the n8n API (`n8n_api`) or the node context (`execution_context`).

### Toggles

- **Include Full Workflow JSON** — attach the workflow definition for structural quality assessment. The full JSON is only available when the n8n API is connected; without it, only lightweight metadata (id, name, active) is attached and structural checks stay disabled.
- **Run Quality Assessment** — trigger Pisama's structural quality assessment. Requires the full workflow JSON (n8n API connection).

## Failure isolation

This node never fails your workflow. When Pisama is unreachable, slow, or rejects the request, the node logs a warning, outputs `{ "forwarded": false, "error": "..." }`, and lets the rest of the workflow run. Sends have a 10 second timeout, so a hanging endpoint cannot stall an execution.

If you want a failed send to fail the node instead (for example, to make lost telemetry visible in a monitoring workflow), enable **Strict mode** in the node parameters.

## Security

Payloads are signed with HMAC-SHA256 over `{timestamp}.{body}` using your webhook secret, sent as `X-Pisama-Signature: sha256=…` alongside `X-Pisama-Timestamp` and a per-request `X-Pisama-Nonce` for replay protection.

Report vulnerabilities privately using the process in
[SECURITY.md](SECURITY.md). Do not include secrets or workflow data in public
issues.

## Package lifecycle

This is the supported n8n community-node integration. The separate
[`pisama-n8n`](https://github.com/Pisama-AI/pisama-n8n) repository is the
self-hosted analysis service and dashboard. They serve different roles and
neither replaces the other.

## Self-hosted Pisama

Set the API URL field in credentials to your own deployment (e.g., `https://pisama.your-company.com/api/v1`). All other behavior is identical.

## License

MIT
