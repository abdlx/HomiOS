# HomiOS interface architecture

The desktop keeps HomiOS branding, wallpaper, dock customization, and GlassSurface metrics. The interface adopts useful patterns from the local Umbrel reference: calmer cards, consistent spacing, prominent app headers, grouped settings, and explicit loading states. Components and visual assets remain HomiOS implementations.

## Ownership

- `features/files` owns directory views, selection, clipboard snapshots, destination browsing, conflicts, and batch presentation. `src/App.tsx` remains a compatibility export.
- `features/apps` owns discovery, app details, connection setup, logs, domains, and storage selection. `components/AppStoreApp.tsx` remains a compatibility export.
- `features/settings` owns the catalog, overview, shared frame, grouped controls, Appearance, device identity, network, and About. Every settings route uses the same frame; drill-in pages have one back action rather than reopening the legacy sidebar. Existing team, token, notification, storage, and sharing actions retain their APIs within that frame.
- `ServerDataProvider` owns the browser query cache. Directory queries are keyed by normalized path, fresh for five seconds, cancellable, and invalidated after mutations. Previous-folder data is never used as a placeholder for another path.
- `useShellNavigation` owns public URL synchronization, browser history, reload restoration, and saved navigation context for each app. `WindowManager` controls visibility and makes inactive windows inert.
- `useLauncherApps` and `useLauncherLayout` share capability-filtered apps, installed resources, and saved grid/dock preferences between desktop and mobile. Mobile uses native scrolling, real app data, and reachable buttons without a simulated device status bar or home indicator.
- `useSystemStats`, `useCapabilities`, and `useRemoteResource` share cached server data. Polling pauses in hidden documents and inactive surfaces where applicable.

## Operations and state

The server job store remains the authority for transfers and app lifecycle work. The client submits a batch without waiting for earlier jobs to finish, groups results, and recovers progress from persisted jobs after reload. Clipboard items are immutable; successful moves remove cut items, failures keep them available for retry, and copies remain reusable.

Copy/move payloads accept optional `collisionPolicy` and `batchId` fields without a schema migration. The server chooses keep-both names under a commit lock and revalidates collisions at execution time. Replacement stages the incoming data, journals commit phases, and retains a recoverable destination backup until commit. Startup recovery rolls back incomplete commits or recognizes completed commits. Permanent deletion retains its confirmation.

## Presentation and accessibility

Shared controls, sheets, skeletons, empty states, error panels, and focus management live in `components/ui`. Motion uses short opacity/transform transitions and respects both system and HomiOS reduced-motion preferences. Appearance settings expose accent, density, and desktop icon size while retaining theme, wallpaper, glass, and resource controls. File and catalog views use bounded DOM windows.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`. Vitest separates Node tests from DOM tests. Playwright runs Chromium desktop/tablet and WebKit phone workflows against isolated files and database under `.cache/browser-fixtures`, plus separate build output; it saves review screenshots under `.cache/screenshots`.

Transfer tests exercise replacement rollback, restart recovery, concurrent collisions, cancellation, and simulated EXDEV moves. `tests/file-transfer-linux.test.ts` also runs a real cross-filesystem replacement on Linux when `/tmp` and `/dev/shm` are on different devices; it is skipped on Windows. Real Linux cross-volume replacement and real Coolify deployments require an appropriate host and integration credentials; mocked browser workflows do not establish those results.
