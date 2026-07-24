# Changelog

All notable changes to `n8n-nodes-pisama` are documented here.

## Unreleased

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
