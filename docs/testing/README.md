# HomiOS RC — Physical Validation Overview

This directory contains **manual physical validation procedures** for the HomiOS
release candidate. These tests require actual Linux hardware with USB drives and
cannot be replaced by automated unit/integration tests.

## Release Status Template

### Automated Validation

| Check | Status |
|---|---|
| TypeScript (`npx tsc --noEmit`) | — |
| Unit / integration tests (`npm run test`) | — |
| Shell syntax (`bash -n install.sh`) | — |
| Mirror semantics | — |
| Backup semantics | — |
| Versioned semantics | — |
| Mock ENOSPC (simulated) | — |
| Mock disconnect (simulated) | — |
| Capability gating | — |
| Port default 8740 | — |
| Atomic copy / partial staging | — |
| Protection health states | — |
| Startup reconciliation | — |

### Physical Validation

> **IMPORTANT**: Do not mark PASS unless genuinely run on real hardware.
> Simulated/mocked tests do not substitute.

| Test | Status | Hardware | Date |
|---|---|---|---|
| A — USB drive reorder | NOT RUN | — | — |
| B — Real ENOSPC (loopback) | NOT RUN | — | — |
| C — Reboot mid-backup | NOT RUN | — | — |
| D — Samba persistence post-reboot | NOT RUN | — | — |
| E — Scheduled run (no manual trigger) | NOT RUN | — | — |

## Test Procedures

- [Physical Test A — USB Drive Reorder](physical-test-a-usb-reorder.md)
- [Physical Test B — Real ENOSPC via Loopback](physical-test-b-real-enospc.md)
- [Physical Test C — Reboot Mid-Backup](physical-test-c-reboot-mid-backup.md)
- [Physical Test D — Samba Persistence](physical-test-d-samba-persistence.md)
