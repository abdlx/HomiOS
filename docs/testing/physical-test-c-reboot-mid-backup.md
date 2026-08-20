# Physical Test C — Reboot Mid-Backup

**Purpose**: Verify that a system reboot during an active backup does not corrupt
the destination, does not leave a job permanently stuck as Running, and allows
the next scheduled run to execute normally.

**Risk level**: Medium — use only disposable test data.

---

## Prerequisites

- A large source directory (several GB to ensure backup takes > 30 seconds).
- A USB destination drive.
- Do NOT use production data.

---

## Procedure

1. **Create large test data** (adjust to get a backup that runs for > 30 s):
   ```bash
   mkdir -p ~/homios-reboot-test-source
   dd if=/dev/urandom of=~/homios-reboot-test-source/bigfile.bin bs=1M count=2048
   ```

2. In HomiOS, create a backup plan:
   - Source: `~/homios-reboot-test-source`
   - Destination: USB drive mount point
   - Mode: Backup
   - Schedule: any (or manual)

3. **Start the backup** (Sync now).

4. In Job Center, confirm the phase shows **Copying**.

5. **Immediately reboot the host** (do not gracefully stop HomiOS):
   ```bash
   sudo reboot now
   # Or use the hardware power button for a harder test.
   ```

6. Allow the host to boot and HomiOS to restart automatically.

7. Open **Job Center** in HomiOS.

---

## Pass Criteria

| Criterion | Expected | Result |
|---|---|---|
| HomiOS starts normally | Yes | — |
| Old job status | Failed / Interrupted (NOT Running) | — |
| Old job shows clear reason | "Server restarted during backup" | — |
| Partial file promoted as complete | No | — |
| Protection health | At Risk or Not Yet Protected | — |
| Next scheduled run fires automatically | Yes (after next scheduler tick) | — |
| New successful run restores health to Healthy | Yes | — |

---

## Verification After Restart

```bash
# Confirm the homios service started cleanly
journalctl -u homios -n 50 --no-pager

# Confirm the old running job is now failed (not stuck running)
# Check via Job Center UI or query the database:
sqlite3 /opt/homios/data/filemanager.db \
  "SELECT id, type, status, error FROM jobs WHERE type='sync.run' ORDER BY created_at DESC LIMIT 5;"
```

---

## Cleanup

```bash
rm -rf ~/homios-reboot-test-source
```

---

## Record Result

- **Date:**
- **Hardware:**
- **Result:** PASS / FAIL
- **Notes:**
