#!/bin/sh
set -eu
cd /opt/delta-management
test -f .env.production
chmod 600 .env.production
: "${DELTA_RELEASE:?Set DELTA_RELEASE to the reviewed commit SHA}"
export DELTA_RELEASE
test "$(git rev-parse HEAD)" = "$DELTA_RELEASE"
test -z "$(git status --porcelain)"
docker compose build app worker
# Apply reviewed additive migrations only after checking migrate status.
docker compose run --rm --no-deps worker node_modules/.bin/prisma migrate status
printf 'Review pending migrations. Apply with: docker compose run --rm --no-deps worker node_modules/.bin/prisma migrate deploy\n'
printf 'Then start app only: docker compose up -d app\n'
printf 'After confirming worker ownership: docker compose --profile worker up -d worker\n'
printf 'Install only ops/delta-traefik.yaml into /docker/traefik/dynamic/ after cutover approval.\n'
