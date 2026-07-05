# Changelog

All notable changes to this project will be documented in this file.

## [0.1.20] - 2026-07-05

### Fixed
- Folder picker: pass folder ID (not folder object) to `folders.getSubFolders` / use `folders.query` — fixes "Incorrect argument types" error.
- Processed-tag detection now uses Thunderbird tag **keys** instead of display names.
- Settings save merges with existing values instead of wiping `processedTagKey` and other fields.
- Tag application merges with existing message tags instead of replacing them.
- `moveToTrash` action completes via `messages.delete` or trash-folder fallback.

### Added
- Extension icons, `.webextensionignore`, and lean `web-ext` build (dev files excluded).
- `messagesTagsList` and `messagesDelete` permissions.
- Bulk classify wired in Options; Ollama fetch timeout; background `ping` handler.
- `utils/folders.js` for cross-account folder selection.

## [0.1.4] - 2026-06-23

### Added
- Duplicate tag name prevention with warning when saving.
- "Import tags from Thunderbird" button.
- Visual "✓ in Thunderbird" indicator for tags that already exist natively.

## [0.1.3] - 2026-06-23

### Added
- Right-click context menu: **"AI Tagger: Run classification now"** on messages (much better UX).
- Basic **Rules / Actions** system:
  - Create rules with required tags (`allTags` AND condition).
  - "Move to folder" action supported.
- Keywords are now saved and used by the LLM.

## [0.1.2] - 2026-06-23

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-06-23

### Added
- **Keywords** field for tags (comma-separated). These are sent to the LLM together with the name and description.
- Stronger use of tag name + keywords in classification prompt (optimized for Mistral 8B and similar small models).

### Changed
- LLM prompt significantly updated to give more weight to the tag **name** and **keywords** (not only the description). This improves accuracy on 8B-class models.

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