# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Push notifications are now optional for every role. The full-screen "Notifications Required" block for non-admins is removed, so the app works with notifications denied. Notification Settings no longer says notifications are mandatory. Declining the OS permission is the opt-out. Needs a new store build (this is app code, so an OTA update would also deliver it, but the iOS review needs a new binary).

## [1.1.9] - 2026-11-05

This version adds native code (a new Android downloads module, `expo-image-manipulator`, and new splash images), so it needs a new store build. An OTA update alone will not deliver it.

### Added
- Create RCA form on Incidents. It is one scrollable form with sections, photo upload for each section, and voice dictation for each text field (up to 2 minutes per recording, English only). The mic is hidden on builds without `expo-audio`.
- "No Access" ticket status. The technician must collect the client's name and signature before a ticket can move to it. The server pauses the ticket's SLA clocks while it is set. It takes the place of Waiting in the status picker.
- "No access" option for Temp RH rooms, for when a room could not be entered. The room counts as done without readings and shows as No access in log history.
- Account Settings screen, opened from the "Account Settings" row on the Settings tab. It holds the identity card (profile photo change, name, role, presence, details), Change Password and the account deletion link, which moved off the Profile screen.
- Custom date range picker on the Attendance, Reports and Efficiency screens.
- Download notifications. Exporting a report shows "Downloading" and then "Downloaded", and tapping the second one opens the file (Android uses the new `jouleops-downloads` native module).
- "Rate JouleOps" stars card on Home, Android only. It appears only after a week of use on at least 5 different days, at most once every 30 days and 3 times per device, and never again after a star is tapped.
- Home operational status card now shows Pending / Completed for Tickets, and also for Site logs and PM when the user can view those modules.
- New light and dark splash screens with a loading bar.

### Changed
- Hold is retired for ticket status updates. The Hold and Waiting filter chips only appear while older tickets still carry that status.
- PM checklist tasks are now all a tick or cross box, whatever the old `field_type` said. A reading is required only where the checklist sets `readings_mandatory`, and it is not required on a crossed task. Answers saved by older builds are still read correctly.
- "Complete & sign" on Temp RH, Water, Chemical and chiller logs is now one submit. Values stay on the phone while you type, and nothing is sent until you submit. If the submit cannot reach the server, it waits in the offline queue and retries.
- When "Complete & sign" cannot go ahead (still loading, no rooms, readings missing), the screen now says why instead of leaving a disabled button.
- Site log history loads 25 rows per page, with a stats summary, and uses a `FlashList`.
- Signatures are stored as a small SVG data URI built from the strokes, so no temporary file is written.
- Background sync no longer pulls new data while an operator is entering a log. Queued saves still upload, and a catch up sync runs when the screen closes.
- Gradient backgrounds and pinned headers on Attendance, Profile, Account, Appearance and Attendance Logs. Buttons, badges, progress bars and task rows use a glossy fill.

### Fixed
- App restarting after taking a photo on Android phones with 50 MP or 108 MP cameras. The picker now takes the photo without decoding the whole frame, scales it down to 2560 px on the longest side, and recovers the photo if Android closed the app while the camera was open. All photo pickers use it.
- Chiller reading saves that failed on a weak connection could replay later and overwrite a completed reading with older values (blank signature, or reopened). A replay now sends the reading's current state, so order no longer matters.
- Tapping a chiller reading in the site logs history opened a blank new reading instead of the one you tapped.
- Chiller history cards showed empty Supply, Return and Load values. They now show Evap. In, Evap. Out and Load from the real columns.
- Entry screens appeared to freeze ("Complete does nothing") on a slow site connection, because they waited for the server request. Saves now return as soon as the phone has the data, and the upload happens in the background in order.
- Offline & Sync could close the app's shared SQLite handle, after which every database call failed until the app was killed. The app now uses its own private connection.
- Site log rows filed under the wrong category on the server (for example a Water "WTP Parameters" row inside Temp RH shifts) are removed from the phone on the next sync.
