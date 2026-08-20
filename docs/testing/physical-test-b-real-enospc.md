# Physical Test B — Real ENOSPC via Loopback Filesystem

**Purpose**: Verify HomiOS handles a genuine out-of-space condition on the backup
destination gracefully — job fails, Node stays running, partial file is NOT promoted,
and health shows At Risk.

**Risk level**: Medium — uses a loopback device; no real drives at risk.
Run this ONLY on a machine where you can create/destroy loop devices safely.

---

## Setup

```bash
# 1. Create a 200 MB loopback image (tiny, fills fast)
sudo truncate -s 200M /tmp/homios-full-test.img

# 2. Format it
sudo mkfs.ext4 -F /tmp/homios-full-test.img

# 3. Mount it
sudo mkdir -p /mnt/homios-full-test
sudo mount -o loop /tmp/homios-full-test.img /mnt/homios-full-test

# 4. Verify free space
df -h /mnt/homios-full-test
```

## Create Source Data Larger Than 200 MB

```bash
# e.g., 250 MB of source files
sudo mkdir -p /tmp/homios-enospc-source
sudo dd if=/dev/urandom of=/tmp/homios-enospc-source/bigfile.bin bs=1M count=250
```

---

## Procedure

1. In HomiOS Storage Dashboard, create a backup protection plan:
   - Source: `/tmp/homios-enospc-source`
   - Destination: `/mnt/homios-full-test`
   - Mode: Backup (or Mirror)

2. Run the backup (click **Sync now** or wait for scheduler).

3. Observe in Job Center:
   - Job starts (Scanning ? Copying)
   - ENOSPC occurs mid-copy
   - Job transitions to **Failed**

4. Check HomiOS Node process is still running:
   ```bash
   sudo systemctl is-active homios
   # Expected: active
   ```

5. Check that no partial file is shown as completed:
   ```bash
   ls -la /mnt/homios-full-test/HomiOS-Backups/
   # Look for .*.homios-partial-* files — these should be absent or 0-byte
   # The partially copied file must NOT exist as the final filename
   ```

6. Check protection health shows **At Risk** in the dashboard.

7. Verify retry is available in Job Center.

---

## Cleanup

```bash
sudo umount /mnt/homios-full-test
sudo rm -f /tmp/homios-full-test.img
sudo rmdir /mnt/homios-full-test
sudo rm -rf /tmp/homios-enospc-source
```

---

## Pass Criteria

| Criterion | Expected | Result |
|---|---|---|
| Job status | Failed | — |
| HomiOS process | Still running | — |
| Partial file visible as complete | No | — |
| Previously completed files valid | Yes | — |
| Protection health | At Risk | — |
| Retry available | Yes | — |
| UI explains destination full | Yes | — |

---

## Record Result

- **Date:**
- **Hardware:**
- **Result:** PASS / FAIL
- **Notes:**
