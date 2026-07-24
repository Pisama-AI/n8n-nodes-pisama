# Changelog

All notable changes to `n8n-nodes-pisama` are documented here.

## Unreleased

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
