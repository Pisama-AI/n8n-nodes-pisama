# Contributing

Contributions that improve telemetry fidelity, failure isolation, security, or
n8n compatibility are welcome.

## Development

```bash
npm ci
npm run build
npm run lint
npm test
npm pack --dry-run
```

Tests must exercise the real node source and must not make network calls. Never
commit API keys, workflow credentials, production payloads, or customer data.

Open a pull request with a concise problem statement, compatibility impact,
and the commands used for validation.
