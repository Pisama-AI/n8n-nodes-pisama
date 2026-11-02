# Changelog

All notable changes to `n8n-nodes-pisama` are documented here.

## [0.5.4] - 2026-11-02

### Removed

- Removed the hosted Pisama for n8n cloud service from the credential help and
  README. The service was shut down on 2026-11-02, so the Pisama platform and a
  self-hosted server are the two supported options. No execution-payload or
  authentication behavior changes.

### Action required

- If a saved Pisama credential still points at the hosted service, its sends now
  fail and keys issued by that service no longer work. Workflows keep running
  unless Strict mode is on, but their executions stop reaching Pisama. Update the
  credential for the Pisama platform (API URL `https://api.pisama.ai/api/v1`, a
  key from pisama.ai/settings/api-keys, and the webhook secret issued when you
  register the workflow) or for your own self-hosted server.

## [0.5.3] - 2026-09-08

- Replace the retired documentation link in credential help and README with
  the maintained package configuration and telemetry guidance.
- Include the maintenance updates since 0.5.2: refreshed development tooling,
  Node consumer-install CI checks, publish workflow maintenance, and copyright
  attribution. No execution-payload or authentication behavior changes.

## Historical maintenance notes

These notes were already included in the 0.5.2 tag under an "Unreleased" heading.

- Preserve `execution_context` provenance when the n8n API returns no usable
  execution record.
- Split telemetry collection, payload construction, signing, and failure
  isolation into bounded units with a CI-enforced complexity ceiling of 15.
- Cover partial and unavailable n8n API responses plus unsigned webhook
  delivery, reaching 100 percent line and function coverage.
- Enforce 100 percent line, function, and statement coverage plus 90 percent
  branch coverage in CI.
- Add CodeQL and pull request dependency review.
- Add security, contribution, conduct, and dependency-maintenance policies.
- Inspect the exact npm publish tarball in CI.
- Document the lifecycle boundary between the community node and the
  self-hosted Pisama for n8n service.
- Validate against the current n8n workflow types and node CLI, and refresh
  supported maintenance tooling.

## [0.5.2] - 2026-07-23

### Changed

- Declared the supported Node.js runtime and package issue tracker.
- Added explicit light and dark icon variants for current n8n community-node
  validation.
- Migrated npm publication to tokenless trusted publishing with a
  tag-to-version release guard.

## [0.5.1] - 2026-04-29

### Fixed

- Preserved honest execution telemetry when the optional n8n API connection is
  unavailable.
