# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-06-23

### Added
- Separate **Subject** field in the Test Classification tab for more realistic testing.
- Automatic version sync between `package.json` and `manifest.json` on build.
- `CHANGELOG.md` to track releases.

### Changed
- **Tag creation** is now more robust: tries `browser.messages.tags.create()` and gracefully falls back if the API is unavailable or the tag already exists.
- Improved LLM prompt for better consistency across models (Llama, Mistral, etc.).
- Added `"messagesTags"` permission so native Thunderbird tags can be created when supported.
- Removed all inline `onclick` handlers to satisfy Thunderbird's strict Content Security Policy.

### Fixed
- Quotes (`"`) in tag descriptions are now properly preserved in the UI.
- `npm version patch` now correctly produces versioned `.zip` files.
- Background messaging reliability improved.

### Notes
- Tags are always managed internally by the extension. Creation in Thunderbird's native tag list is best-effort and optional.
- Classification continues to work even if native tag creation fails.

## [0.1.0] - Initial Release

- Initial scaffold with core one-LLM-call classification.
- Options page for managing tags and testing.
- Support for local Ollama.
- Basic priority + stopProcessing logic.