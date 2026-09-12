# NAS deployment

Build with `npm ci && npm run build:release`. The `artifacts/release` directory contains minified backend bundles, built frontend assets and a runtime dependency lockfile. No source tree, source maps, local configuration, browser cookies, database or recordings are included. JavaScript bundles are executable build artifacts, not an encryption mechanism.

Copy this directory as `release` beside `deploy/compose.yaml`. Create `.env` with a random `DB_PASSWORD`, `APP_PORT=13010` and optionally `RECORDING_CONCURRENCY=2`. Create `data/recordings` writable by UID 1000, then run `docker compose up -d --build`. The app connects to the existing NAS PostgreSQL at `host.docker.internal:15432`. Pre-create a database and a dedicated login (both default to `sc_insight_app`), grant that login ownership of the database, and set `DB_PASSWORD` to its password. The login does not need superuser or cluster-wide database creation privileges. Override `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` in `.env` if needed. PostgreSQL remains managed by the host; recordings persist in `data/recordings`.

The application is intended for a trusted LAN and currently has no account authentication. Do not forward its port to the public internet. Browser desktop notifications require HTTPS or localhost; use a TLS reverse proxy for notifications over a LAN hostname.

Check `docker compose ps` and `/api/health`. Updates replace only `release`, then rebuild the app container; preserve `.env` and `data`. Stop active recordings before updates. Back up PostgreSQL with `pg_dump` and back up `data/recordings` separately. Never use `docker compose down -v` to update.

Public upstream APIs can change: unresolved room statuses and long-running recording recovery remain under investigation. A successful container health check does not prove every upstream stream is available.
## Proxy and migration

System Settings → Network Proxy accepts an HTTP / HTTPS proxy and offers a connection test. Saved settings persist in PostgreSQL and are applied before workers start. For a proxy running on the NAS host, use `http://host.docker.internal:7890`; Compose supplies the host-gateway mapping. Existing streaming connections adopt changed settings on reconnect.

For migration, stop the old application, back up both databases, restore into the dedicated database, copy recordings, and rewrite `recordings.directory` plus `settings.storage` to container paths. Keep migration dumps private and outside release artifacts. Do not run both instances with automatic recording enabled against the same subscriptions.

## Moving from the bundled PostgreSQL container

Back up the current Compose configuration and `.env` privately. Stop the app before the final `pg_dump -Fc` so collectors and recorders cannot write during the copy. Restore into a new empty host database using `pg_restore --no-owner --no-acl --role=<app-role>`; compare every table count, data checksums, and sequence state before switching. Update the app connection, start only the app, and verify health plus resumed sampling. Stop the old `sc-insight-db-1` container and disable its automatic restart after acceptance; retain its data directory and dump for rollback. Never overwrite a pre-existing database just because it has the same name. A rollback after new writes requires preserving and reconciling those writes first.
