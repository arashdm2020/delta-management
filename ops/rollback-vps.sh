#!/bin/sh
set -eu
cd /opt/delta-management
: "${DELTA_ROLLBACK_RELEASE:?Set a previously verified image tag}"
docker image inspect "delta-management-app:$DELTA_ROLLBACK_RELEASE" >/dev/null
export DELTA_RELEASE="$DELTA_ROLLBACK_RELEASE"
docker compose --profile worker stop worker
docker compose up -d --no-build app
# Additive inbox tables are retained. Never reverse production migrations here.
curl --fail --retry 5 --retry-delay 3 http://127.0.0.1:3010/api/health
