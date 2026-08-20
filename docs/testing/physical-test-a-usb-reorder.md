# Physical Test A — USB Drive Reorder

**Purpose**: Verify that HomiOS uses filesystem UUID/PARTUUID for drive identity and
is unaffected by changes to `/dev/sdX` assignments caused by USB re-plug order.

**Risk level**: Low — uses disposable test drives only.

---

## Prerequisites

- Two disposable USB test drives (any capacity).
- A Linux host running HomiOS.
- Note the UUIDs before starting: `lsblk -o NAME,UUID,PARTUUID,MOUNTPOINT`

---

## Procedure

1. **Baseline** — record current state:
   ```bash
   lsblk -o NAME,UUID,PARTUUID,MOUNTPOINT
   # Record the UUID ? /dev/sdX mapping for both test drives.
   ```

2. Open **Storage Dashboard** in HomiOS. Note:
   - Drive names / labels displayed.
   - Any backup plans associated with each drive.
   - Any Samba shares pointing to each drive.

3. **Safely stop HomiOS**:
   ```bash
   sudo systemctl stop homios
   ```

4. **Unplug both test USB drives**.

5. **Replug them in the opposite order** (different USB ports if available).

6. **Reboot the host** (optional but recommended):
   ```bash
   sudo reboot
   ```

7. After boot, verify new device assignments:
   ```bash
   lsblk -o NAME,UUID,PARTUUID,MOUNTPOINT
   # /dev/sdb and /dev/sdc may have swapped. UUIDs must be the same.
   ```

8. Open **Storage Dashboard** in HomiOS.

---

## Pass Criteria

| Criterion | Expected | Result |
|---|---|---|
| Drive names/labels | Unchanged | — |
| UUID identity | Same UUID per drive | — |
| Backup plan association | Correct drive | — |
| Samba share target | Correct drive | — |
| `/dev/sdX` change | Does not matter | — |

---

## Record Result

- **Date:**
- **Hardware:**
- **Result:** PASS / FAIL
- **Notes:**
