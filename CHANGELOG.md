# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-10

### Added

- Shared custody calendars: one week in two, 2-2-3, 2-2-5-5, 3-4-4-3, 1st/3rd/5th
  or 2nd/4th weekends, or a custom block sequence, from a handover time.
- Shift work calendars: 2x8, 3x8, 5x8, 12-hour day/night, on-call one week in
  two, three or four, or a custom sequence, with editable shift hours.
- Up to three cycles per user, each one a calendar of their own, generated 3 to
  12 months ahead and slid every night, without duplicates.
- Scene triggers "Children arrive or leave" and "Shift starts or ends", scene
  action "Get where a cycle stands", dashboard widget "Cycles".
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-cycles/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-cycles/releases/tag/v1.0.0
