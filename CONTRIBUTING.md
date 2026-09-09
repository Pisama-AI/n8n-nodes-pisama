# Contributing

Contributions that improve telemetry fidelity, failure isolation, security, or
n8n compatibility are welcome.

## Development

```bash
npm ci
npm run build
npm run lint
npm test
npm run audit:production
npm run audit:all-high
npm pack --dry-run
```

Tests must exercise the real node source and must not make network calls. Never
commit API keys, workflow credentials, production payloads, or customer data.

Open a pull request with a concise problem statement, compatibility impact,
and the commands used for validation.

CI and publication reject moderate-or-higher production findings and
high-or-critical findings across the full dependency tree. A passing full-tree
gate can still report moderate findings; do not describe it as a clean audit.
Track those findings and verify upstream compatibility before changing pinned
transitive dependencies or forcing a major-version override.
