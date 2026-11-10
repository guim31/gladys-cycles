# Cycles for Gladys Assistant

Shared custody and shift work as [Gladys Assistant](https://gladysassistant.com) calendars. Pick a model
(one week in two, 2-2-3, 2-2-5-5, 3-4-4-3, 1st/3rd/5th weekends, 2x8, 3x8, 5x8, 12-hour day/night, on-call
weeks, or your own sequence) and the date its first day fell on: the integration generates the calendar
months ahead, slides it every night, and tells the scenes and the dashboard who has the children and which
shift is running.

This is an **external integration** of type `calendar` (Gladys 5.2.0 or later): it runs in its own
sandboxed container and pushes calendars and events into the core calendar store, per user. Nothing is
downloaded: every event is computed in the container (`transports: local`).

> Developed without a real Gladys instance: tested with its automated test suite (models, daylight saving
> changes, leap years, start dates in the past) against the SDK's fake Gladys, and its Docker image started
> once in the Gladys sandbox constraints. Feedback welcome on the Gladys forum or in the issues.

## Features

- **Per user**: every member of the household enables the integration in **My calendars** and sets up to
  three cycles. Each one becomes a calendar of theirs, private until they share it with the household.
- **Custody**: "Children with me" / "Children with the other parent" periods, from one handover time to the
  next, with the usual models and a custom block sequence (`2/2/5/5`). Weekends are counted by their
  Saturday.
- **Shift work**: morning, afternoon, night, 12-hour day and on-call periods with their hours (editable:
  `M=05:00-13:00; N=21:00-05:00`), from the usual models or a custom sequence (`2M 2A 2N 4R`).
- **A sliding window**: a week back, 3 to 12 months ahead, republished every night and at every change of
  settings, without duplicates (the core prunes the window).
- **Scene triggers**: "Children arrive or leave" and "Shift starts or ends" (filters: calendar, change,
  kind of shift), within 30 seconds of the change, never at start-up nor on a change of settings.
- **Scene action** "Get where a cycle stands": children at home or not, today's shift, the next change and
  the minutes until it.
- **Dashboard widget** "Cycles": one line per shared cycle, then the coming changes.
- Four languages (English, French, German, Spanish): the calendars follow the language of their owner.

## Requirements

- Gladys Assistant **5.2.0 or later** (calendar integrations).
- Nothing else: no account, no device, no internet access.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-cycles`.
2. Each user opens **Integrations → Cycles**, fills a cycle in **My calendars** (model, start date,
   handover time…) and clicks **Enable**.
3. Share the calendar in the list under the form to see it on the dashboard and use it in scenes.

The user documentation, in [English](docs/en.md), [French](docs/fr.md), [German](docs/de.md) and
[Spanish](docs/es.md), details every model and field.

## Limits

- School holidays shared by halves are not handled: their rules (which half, which year, which zone) vary
  too much between judgments. Edit the start date or the model during the holidays.
- One handover time per cycle; public holidays do not shift the cycles.
- At most three cycles per user, one year ahead.
- A transition that happens while the integration is stopped fires no scene.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`), in the
`Europe/Paris` time zone, with an injectable clock. See [`CLAUDE.md`](CLAUDE.md) for the architecture and
the rules of the repository. Releases go through **Actions → Release**, which bumps the version, rolls
[`CHANGELOG.md`](CHANGELOG.md) and builds the multi-arch image on `ghcr.io`.

## Credits

- Built on the official [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js) (Apache-2.0).
- Requested in the Gladys community list of integrations to bring to the store (shared custody, shift
  rotation).

Not affiliated with any employer, court or public body.

## License

[Apache-2.0](LICENSE)
