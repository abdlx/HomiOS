#!/bin/bash
# ============================================================
#  coolify-install.sh — DEFENSIVE STUB (not part of the active install path)
#
#  The active Coolify setup path is:
#    install.sh → scripts/coolify-up.sh
#
#  This file exists at the repository root but is NOT invoked anywhere in
#  the codebase. It is kept as a stub so it can never silently do harm if
#  called accidentally. Any execution attempt is rejected unless both
#  ownership preconditions are met — and even then, it refuses with a
#  redirect message, because the real work belongs in scripts/coolify-up.sh.
# ============================================================

# Fail-closed: default COOLIFY_MODE to 'disabled', not 'managed'.
# This ensures that running this script from an unconfigured shell is
# always a hard failure rather than a silent proceed.
if [ "${COOLIFY_MODE:-disabled}" != "managed" ] || \
   [ "${COOLIFY_OWNED_BY_OPENFINDER:-false}" != "true" ]; then
  echo "[coolify] ERROR: Coolify lifecycle operations require:" >&2
  echo "[coolify]   COOLIFY_MODE=managed (got: '${COOLIFY_MODE:-disabled}')" >&2
  echo "[coolify]   COOLIFY_OWNED_BY_OPENFINDER=true (got: '${COOLIFY_OWNED_BY_OPENFINDER:-false}')" >&2
  echo "[coolify] Both conditions must be true before any Coolify operation runs." >&2
  exit 1
fi

echo "[coolify] coolify-install.sh is a stub and is not the active install path." >&2
echo "[coolify] To install/start Coolify, use: bash scripts/coolify-up.sh" >&2
echo "[coolify] (with COOLIFY_MODE=managed and COOLIFY_OWNED_BY_OPENFINDER=true set)" >&2
exit 1
