#!/bin/sh
# Substitute this deployment's portal port into the built OHIF config.
#
# nginx:alpine runs every executable /docker-entrypoint.d/*.sh before starting
# nginx, which is the only hook available here: app-config.js is baked into the
# image by `pnpm run build`, so compose cannot interpolate into it the way it
# does a compose file.
#
# What needs substituting is only the PORTAL's port. OHIF's own origin is
# window.location.origin in the config -- correct by construction -- and the
# host is taken from window.location too, so a deployment moving to another
# machine needs no rebuild and nothing here.
#
# Idempotent: the placeholder is gone after the first run, so a `docker compose
# restart` (which keeps the container's writable layer) is a no-op rather than
# a double substitution.
set -eu

CONFIG=/var/www/html/app-config.js
PLACEHOLDER=__INTERACT_PORT_PORTAL__

[ -f "$CONFIG" ] || { echo "[interact] $CONFIG not found, skipping"; exit 0; }

if ! grep -q "$PLACEHOLDER" "$CONFIG"; then
    # Already substituted on a previous start of this same container.
    exit 0
fi

PORT="${PORT_PORTAL:-}"
if [ -z "$PORT" ]; then
    # Leave the placeholder in place: app-config.js detects it and falls back
    # to the documented default with a console warning, which is a great deal
    # easier to diagnose than a silently wrong port.
    echo "[interact] PORT_PORTAL is not set; leaving $CONFIG unsubstituted" >&2
    exit 0
fi

case "$PORT" in
    ''|*[!0-9]*)
        echo "[interact] PORT_PORTAL='$PORT' is not a port number; refusing" >&2
        exit 1
        ;;
esac

sed -i "s/$PLACEHOLDER/$PORT/g" "$CONFIG"
echo "[interact] portal port in app-config.js set to $PORT"
