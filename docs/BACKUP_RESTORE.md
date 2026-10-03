# Backup & restore

The database is the single source of truth for all user data. Export and
delete live in the app (per user), but operational backup/restore is a
Postgres concern.

## Backup

### Logical dump (recommended for restore flexibility)

```bash
pg_dump -Fc -h $DB_HOST -U $DB_USER -d life -f life-$(date +%F).dump
```

- `-Fc` = custom format (compressed, restorable selectively).
- Schedule daily; retain 7–30 days.

### Render managed Postgres

Enable **Automated Daily Backups** on the `life-db` resource (Render
dashboard → database → Backups). Point-in-time restore is available on paid
plans; the `pg_dump` schedule above is the belt-and-suspenders.

## Restore

```bash
# Into a fresh empty database
createdb life_restore
pg_restore -Fc -d life_restore life-YYYY-MM-DD.dump
```

Then point `DATABASE_URL` at the restored database and restart the API.

## Verification

- `pg_restore --list file.dump` — sanity-check contents
- After restore, run `alembic current` to confirm the schema revision
  matches the deployed app's `alembic_version`.

## Per-user data

- Export: `GET /api/v1/privacy/export` returns the user's complete JSON
  snapshot (all owned tables).
- Delete: `DELETE /api/v1/privacy/account` removes the user row and every
  owned row (FK `ON DELETE CASCADE`), including refresh-token families and
  custom exercises (whose FK is `SET NULL` to protect shared catalog rows).
