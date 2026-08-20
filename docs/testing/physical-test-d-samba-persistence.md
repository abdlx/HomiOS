# Physical Test D — Samba Share Persistence Post-Reboot

**Purpose**: Verify that Samba shares configured through HomiOS survive a system
reboot and are accessible from a remote client immediately after restart.

**Risk level**: Low.

---

## Prerequisites

- A Linux HomiOS host with Samba installed.
- A Windows/macOS/Linux client on the same LAN.
- At least one USB drive already mounted by HomiOS.

---

## Procedure

1. In **Samba Dashboard** (HomiOS), create a new share if one does not exist:
   - Path: a folder on the USB drive
   - Name: `HomiOS-RC-Test`
   - Authentication: enabled

2. From the remote client, connect to the share and **create a test file**:
   ```
   \\<HOST_IP>\HomiOS-RC-Test
   # Windows: Map network drive and create test.txt
   # Linux: mount -t cifs //HOST_IP/HomiOS-RC-Test /mnt/test
   ```

3. Note the file is visible in HomiOS file manager.

4. **Reboot the host**:
   ```bash
   sudo reboot
   ```

5. After the host comes back up, wait ~30 seconds for HomiOS and Samba to start.

6. From the remote client, reconnect to `\\<HOST_IP>\HomiOS-RC-Test`:
   - The share should be available without re-running any scripts.
   - The test file created in step 2 should still be present.

7. Verify Samba user credentials still work (authenticate to the share).

8. In HomiOS Samba Dashboard, confirm the share configuration matches
   what was configured before reboot (same path, same permissions).

---

## Verification Commands (on host)

```bash
# Samba service active
systemctl is-active smbd nmbd

# Share still in config
testparm -s /etc/samba/smb.conf

# Share accessible
smbclient -L localhost -U <USERNAME>
```

---

## Pass Criteria

| Criterion | Expected | Result |
|---|---|---|
| Samba service starts automatically | Yes | — |
| Share visible from remote client | Yes | — |
| Samba credentials still valid | Yes | — |
| Test file still present | Yes | — |
| HomiOS dashboard shows correct share config | Yes | — |
| No manual reconfiguration needed | None | — |

---

## Record Result

- **Date:**
- **Hardware:**
- **Result:** PASS / FAIL
- **Notes:**
