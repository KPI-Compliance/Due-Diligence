# Integration: Slack

**Direction:** Outbound (platform → Slack)  
**Status:** Active  
**Owner:** TecGRC

---

## Overview

Slack is used for operational notifications. The platform sends automated messages when key events occur — primarily when a vendor or partner submits a questionnaire response and when risk thresholds are breached. The integration is one-way: the platform posts to Slack; it does not receive events from Slack.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | Yes | Bot user OAuth token (`xoxb-...`). Requires `chat:write` scope at minimum. |
| `SLACK_ALERT_CHANNEL` | Yes | Default channel for risk and response alerts (e.g., `#risk-alerts`) |
| `SLACK_SIGNING_SECRET` | No | Slack signing secret (only needed if the platform were to receive Slack events — currently unused) |

Integration settings (channel overrides, enabled state) are also configurable in the Settings UI and persisted in `integration_settings` (provider `SLACK`).

---

## Implementation

**File:** [lib/slack.ts](../../lib/slack.ts)

The Slack client uses the Slack Web API (`chat.postMessage`) via authenticated HTTP calls with the bot token. The platform does not use the Slack SDK — calls are made directly with `fetch`.

---

## Notification events

### 1. Questionnaire response received

**Trigger:** Typeform webhook processed successfully.  
**Channel:** `SLACK_ALERT_CHANNEL` (or override from Settings).  
**Content:** Entity name, assessment title, timestamp, link to entity detail page.

### 2. High-risk response

**Trigger:** Risk score calculated as `HIGH` after analyst review or response ingestion.  
**Channel:** `SLACK_ALERT_CHANNEL`.  
**Content:** Entity name, risk level, section scores, link to assessment detail.

### 3. Internal questionnaire dispatch

**Trigger:** Internal questionnaire sent to focal point.  
**Channel:** Direct message to the focal point's Slack user (resolved by email).  
**Content:** Google Form link with pre-filled parameters, context about the vendor/partner.

---

## User resolution

When sending a DM to a focal point, the platform resolves the Slack user by their email address using `users.lookupByEmail`. If the email is not found in Slack, the DM falls back to posting in the alert channel with a note.

---

## Error handling

- If `SLACK_BOT_TOKEN` is missing or invalid, the notification silently fails and logs the error. Webhook processing continues — Slack failure does not block response storage.
- If the channel does not exist or the bot lacks `chat:write` permission, the API returns an error that is logged but not surfaced to the user.

---

## Troubleshooting

### Notifications not arriving

1. Check that `SLACK_BOT_TOKEN` is set and the bot is invited to `SLACK_ALERT_CHANNEL`.
2. Verify the bot has `chat:write` scope in the Slack app configuration.
3. Check Vercel function logs for Slack API errors in the webhook or dispatch routes.

### Direct messages not delivered

1. Confirm the focal point's email matches their Slack account email exactly.
2. Check that the bot has `users:read.email` scope to look up users by email.
3. If the user is not found, the message falls back to the alert channel.

---

## Required Slack bot scopes

| Scope | Purpose |
|---|---|
| `chat:write` | Post messages to channels and DMs |
| `users:read` | Look up user profiles |
| `users:read.email` | Resolve users by email address |
| `channels:read` | Verify channel existence (optional) |

---

## Security notes

- `SLACK_BOT_TOKEN` grants the bot write access to all channels it is a member of. Treat it as a credential.
- Never log the full bot token in application logs.
- `SLACK_SIGNING_SECRET` is not currently used (the platform does not receive Slack events) but should be stored if the integration is extended to handle slash commands or actions.
