import { createDatabaseClient, inspectMigrationState, loadMigration, reportDatabaseError, SafeDatabaseError, verifyInstalledSchema } from './db-config.mjs'

const args = process.argv.slice(2)
let client, transaction = false
try {
  if (args.some((arg) => arg !== '--dry-run')) throw new SafeDatabaseError('INVALID_ARGUMENT', 'Only --dry-run is supported.')
  const dryRun = args.includes('--dry-run')
  const migration = loadMigration()
  client = createDatabaseClient()
  await client.connect()
  await client.query(dryRun ? 'BEGIN READ ONLY' : 'BEGIN')
  transaction = true
  await client.query("SET LOCAL lock_timeout = '5s'")
  await client.query("SET LOCAL statement_timeout = '30s'")
  if (!dryRun) await client.query("select pg_advisory_xact_lock(hashtext('stm56_database_migration'))")
  const state = await inspectMigrationState(client, migration)

  if (state.recorded) {
    const verified = await verifyInstalledSchema(client)
    await client.query('ROLLBACK')
    transaction = false
    console.log(JSON.stringify({ status: 'already_applied', migration: migration.version, verified, changed: false }))
  } else if (dryRun) {
    await client.query('ROLLBACK')
    transaction = false
    console.log(JSON.stringify({ status: 'ready', migration: migration.version, migrationName: migration.name, statements: migration.statements.length, historyPresent: state.historyPresent, pgcryptoPresent: state.pgcryptoPresent, changed: false }))
  } else {
    await client.query(migration.sql)
    const verified = await verifyInstalledSchema(client)
    if (!state.historyPresent) {
      await client.query('create schema if not exists supabase_migrations')
      await client.query('create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text)')
    }
    await client.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3::text[])', [migration.version, migration.name, migration.statements])
    await client.query('COMMIT')
    transaction = false
    console.log(JSON.stringify({ status: 'applied', migration: migration.version, migrationName: migration.name, verified, changed: true }))
  }
} catch (error) {
  if (transaction && client) { try { await client.query('ROLLBACK') } catch {} }
  reportDatabaseError(error)
  process.exitCode = 1
} finally {
  if (client) { try { await client.end() } catch {} }
}
