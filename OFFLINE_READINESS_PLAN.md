# Mobile Offline Readiness Plan

## Verdict

The mobile app is **not 100% offline-capable today**.

It has a solid offline base for cached reads and some queued writes, but several important flows still depend on live network access or have incomplete sync behavior.

## What Already Works Well Offline

- Local SQLite caching is active through `mobile/database/index.ts`, `mobile/services/CacheManager.ts`, and `mobile/services/SyncEngine.ts`.
- Attendance has real offline queue support for check-in and check-out in `mobile/services/AttendanceService.ts` and `mobile/services/SyncEngine.ts`.
- Ticket status/detail updates are queued offline through `mobile/services/TicketsService.ts` and flushed by `mobile/services/SyncEngine.ts`.
- Dashboard, tickets list, attendance history, PM list, and site-log views are mostly cache-first and can render from local data after a successful prior sync.
- Site resolution has offline fallback via SQLite, AsyncStorage, and inferred site codes in `mobile/services/SiteResolver.ts`.

## Confirmed Gaps Blocking 100% Offline

### 1. Auth and account flows are online-only

- Sign-in, sign-up, OTP verification, password reset, and change password require live backend/Supabase access.
- Relevant files: `mobile/contexts/AuthContext.tsx`, `mobile/app/sign-in.tsx`, `mobile/app/sign-up.tsx`, `mobile/app/verify-email.tsx`, `mobile/app/reset-password.tsx`, `mobile/app/forgot-password.tsx`, `mobile/app/privacy-security.tsx`.

### 2. Ticket activity is not offline-safe

- Ticket comments/line items always call the API directly.
- The service itself notes that full offline support is missing for line items.
- Relevant files: `mobile/components/TicketLineItems.tsx`, `mobile/services/TicketsService.ts`.

### 3. Site-log and chiller attachments are not offline-safe

- Attachment uploads in log entry screens and `LogImagePicker` try to upload immediately and fail if offline instead of queueing the file.
- Relevant files: `mobile/app/temp-rh-entry.tsx`, `mobile/app/water-entry.tsx`, `mobile/app/chemical-entry.tsx`, `mobile/components/sitelogs/LogImagePicker.tsx`, `mobile/services/StorageService.ts`.

### 4. PM attachments only partially support offline

- `pm-execution` preserves local URIs when upload fails, but there is no single shared attachment queue for PM, site logs, tickets, and chiller logs.
- Relevant files: `mobile/app/pm-execution.tsx`, `mobile/services/PMService.ts`, `mobile/services/StorageService.ts`.

### 5. Chiller asset lookup is still online-dependent

- Chiller screens load assets through the API and QR lookup hits Supabase directly with no local fallback.
- Relevant files: `mobile/app/chiller.tsx`, `mobile/services/AssetService.ts`.

### 6. Several read APIs still degrade when offline

- Ticket stats are not stored locally.
- Notification preferences depend on the backend.
- WhatsApp messaging and app update checks are online-only.
- Relevant files: `mobile/services/TicketsService.ts`, `mobile/services/NotificationService.ts`, `mobile/services/WhatsAppService.ts`, `mobile/services/UpdateService.ts`.

### 7. The sync architecture is inconsistent

- Runtime code is using SQLite + `offline_queue` + `SyncEngine`.
- The repo also contains old PowerSync connector/schema files, but `@powersync/react-native` is not present in `mobile/package.json` and the connector is not wired into the active runtime.
- This means some comments imply automatic sync that is not actually guaranteed by the current app wiring.
- Relevant files: `mobile/package.json`, `mobile/services/SyncEngine.ts`, `mobile/services/PMService.ts`, `mobile/services/DatabaseService.ts`, `mobile/database/connector.ts`, `mobile/database/powersync-schema.ts`.

## Recommended Target

Define "offline complete" as:

- user logs in once while online,
- app can fully open offline afterward,
- user can read all assigned operational data from cache,
- user can create and update operational records offline,
- attachments are stored locally and uploaded later,
- all queued mutations sync safely when connectivity returns,
- UI always shows sync state and conflict/failure state.

Keep these as explicitly online-only flows unless business requires otherwise:

- first-time sign-in,
- sign-up and OTP verification,
- password reset/change,
- push registration,
- OTA app updates,
- WhatsApp delivery.

## Implementation Plan

### Phase 1 - Standardize the offline architecture

Choose one real source of truth for offline sync.

Recommended: keep the current **SQLite + explicit mutation queue** model and remove stale PowerSync assumptions from active code/comments.

Actions:

1. Document the supported offline domains and online-only domains.
2. Extend `offline_queue` to cover all write types, not just attendance and ticket updates.
3. Remove or quarantine stale PowerSync files/comments unless they are going to be fully wired back in.

### Phase 2 - Make all operational writes queueable

Add queue handlers for:

1. site log create/update/delete
2. chiller reading create/update/delete
3. PM response upsert
4. PM instance status/progress update
5. ticket line item create
6. deferred attachment upload jobs

Implementation notes:

- Expand `mobile/services/CacheManager.ts` item types.
- Expand `mobile/services/SyncEngine.ts` `_processQueueItem()`.
- Ensure each service writes optimistically to SQLite first, then enqueues the mutation.

### Phase 3 - Introduce a unified attachment queue

Current attachment behavior is fragmented.

Build a shared flow:

1. Save captured image locally first.
2. Store a local file URI plus upload metadata in SQLite.
3. Queue upload work in `offline_queue`.
4. When online, upload to storage, replace local URI with remote URL, then enqueue the related record update if needed.

Apply it to:

- site logs,
- chiller readings,
- PM execution,
- ticket activity images.

### Phase 4 - Fill missing offline reads

Add local caches and fallbacks for:

1. ticket stats
2. ticket line items history
3. chiller asset master / QR lookup
4. notification preferences if they matter offline

If some data is display-only and not business-critical, make the UI clearly show "online-only" instead of failing silently.

### Phase 5 - Fix sync visibility and error handling

Users need to know what is pending.

Add:

1. true unsynced counts for every domain
2. per-record sync state (`pending`, `syncing`, `failed`, `synced`)
3. dead-letter recovery UI
4. last successful sync timestamp per domain

Also replace hardcoded assumptions like `getUnsyncedCounts(): return 0` in `mobile/services/SiteLogService.ts`.

### Phase 6 - Define offline auth/session behavior clearly

Support this flow reliably:

1. successful login while online
2. cached session/profile bootstrap while offline
3. app shell loads without blocking on network
4. user can continue field work offline until token refresh is needed

Add explicit UX copy for:

- first login requires internet
- session expired and re-auth is needed
- cached profile is being used

### Phase 7 - Verification matrix before rollout

Test every major module in airplane mode:

1. Dashboard
2. Attendance check-in / check-out
3. Tickets list / update / add activity
4. Site logs create / edit / complete with attachment
5. Chiller create / edit / complete with attachment
6. PM checklist progress / complete with attachment
7. App restart while offline
8. Reconnect and auto-sync
9. Conflict and retry handling

Add automated tests for queue processing and attachment retry logic, then run manual device tests on Android and iOS.

## Priority Order

1. Decide one sync architecture
2. Queue all operational writes
3. Add unified attachment queue
4. Add missing offline reads
5. Improve sync status and recovery UX
6. Complete offline verification suite

## Success Criteria

The app can be called "offline ready" only when a field user can:

- open the app with no internet after prior login,
- view assigned sites, attendance state, tickets, PM tasks, and site-log tasks,
- create/update attendance, tickets, PM work, site logs, and chiller logs offline,
- attach evidence offline,
- restart the app offline without losing unsynced work,
- reconnect and see all pending work sync automatically or surface actionable failures.
