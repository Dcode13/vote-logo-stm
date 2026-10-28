import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { resolve } from 'node:path'
import pg from 'pg'

export const projectRoot = fileURLToPath(new URL('../', import.meta.url))
export const migrationUrl = new URL('../supabase/migrations/202610280001_initial_voting.sql', import.meta.url)
export const rpcNames = ['get_voting_status', 'cast_vote', 'admin_login', 'get_admin_results', 'admin_logout']
export const privateTables = ['logos', 'settings', 'votes', 'admins', 'admin_sessions', 'admin_login_attempts']

export class SafeDatabaseError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SafeDatabaseError'
    this.code = code
  }
}

export function createDatabaseClient() {
  let variables
  try {
    variables = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))
  } catch {
    throw new SafeDatabaseError('ENV_UNAVAILABLE', 'Cannot read .env.local. Add a server-only SUPABASE_DB_URL first.')
  }
  const connection = variables.SUPABASE_DB_URL
  if (!connection) throw new SafeDatabaseError('DB_URL_MISSING', 'SUPABASE_DB_URL is missing from .env.local.')
  let url
  try { url = new URL(connection) } catch {
    throw new SafeDatabaseError('DB_URL_INVALID', 'SUPABASE_DB_URL must be a valid PostgreSQL connection URL.')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new SafeDatabaseError('DB_URL_INVALID', 'SUPABASE_DB_URL must use postgres:// or postgresql://.')
  }
  let user, password, database
  try {
    user = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
    database = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres'
  } catch {
    throw new SafeDatabaseError('DB_URL_INVALID', 'The PostgreSQL URL contains invalid percent encoding.')
  }
  if (!user || !password || !url.hostname) {
    throw new SafeDatabaseError('DB_URL_INCOMPLETE', 'The PostgreSQL URL must include username, password, and host.')
  }
  const port = Number(url.port || 5432)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SafeDatabaseError('DB_URL_INVALID', 'The PostgreSQL port is invalid.')
  }
  let ca
  if (variables.SUPABASE_DB_CA_FILE) {
    try { ca = readFileSync(resolve(projectRoot, variables.SUPABASE_DB_CA_FILE), 'utf8') } catch {
      throw new SafeDatabaseError('DB_CA_UNAVAILABLE', 'Cannot read the CA file configured by SUPABASE_DB_CA_FILE.')
    }
    if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
      throw new SafeDatabaseError('DB_CA_INVALID', 'SUPABASE_DB_CA_FILE must contain a PEM certificate.')
    }
  }
  const client = new pg.Client({
    user,
    password,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port,
    database,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 15_000,
    application_name: 'stm56_database_tools',
  })
  // Idle connection failures must not trigger Node's unhandled-error printer.
  // A subsequent query rejects and is reported through the sanitized handler.
  client.on('error', () => {})
  return client
}

export function reportDatabaseError(error) {
  if (error instanceof SafeDatabaseError) {
    console.error(`${error.code}: ${error.message}`)
    return
  }
  const rawCode = typeof error?.code === 'string' ? error.code : ''
  const code = /^[A-Z0-9_]{3,48}$/.test(rawCode) ? rawCode : 'DATABASE_ERROR'
  const messages = {
    '28P01': 'Database authentication failed. Check the server-only database credentials.',
    '42501': 'The connected database role does not have the required permissions.',
    '42P01': 'An expected database table is unavailable.',
    '42704': 'An expected database object or extension is unavailable.',
    '55P03': 'A database lock could not be acquired safely. Try again when the database is less busy.',
    '57014': 'The database operation timed out and was cancelled.',
    ECONNREFUSED: 'The database connection was refused.',
    ENOTFOUND: 'The database host could not be resolved.',
    ETIMEDOUT: 'The database connection timed out.',
    CERT_HAS_EXPIRED: 'TLS certificate validation failed because the certificate has expired.',
    SELF_SIGNED_CERT_IN_CHAIN: 'TLS validation failed. Configure the trusted provider CA; certificate checks remain enabled.',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS validation failed. Configure the trusted provider CA; certificate checks remain enabled.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS validation failed. Configure the trusted provider CA; certificate checks remain enabled.',
  }
  console.error(`${code}: ${messages[code] || 'The database operation failed. No connection string or credentials were printed.'}`)
}

// Split only at top-level semicolons, keeping PL/pgSQL dollar-quoted bodies,
// strings, quoted identifiers, and SQL comments intact for migration history.
export function splitSqlStatements(sql) {
  const statements = []
  let start = 0, index = 0, quote = null, dollar = null, blockDepth = 0, lineComment = false
  while (index < sql.length) {
    const char = sql[index], next = sql[index + 1]
    if (lineComment) { if (char === '\n') lineComment = false; index += 1; continue }
    if (blockDepth) {
      if (char === '/' && next === '*') { blockDepth += 1; index += 2; continue }
      if (char === '*' && next === '/') { blockDepth -= 1; index += 2; continue }
      index += 1; continue
    }
    if (dollar) {
      if (sql.startsWith(dollar, index)) { index += dollar.length; dollar = null } else index += 1
      continue
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) { index += 2; continue }
        quote = null
      }
      index += 1; continue
    }
    if (char === '-' && next === '-') { lineComment = true; index += 2; continue }
    if (char === '/' && next === '*') { blockDepth = 1; index += 2; continue }
    if (char === "'" || char === '"') { quote = char; index += 1; continue }
    if (char === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)
      if (match) { dollar = match[0]; index += dollar.length; continue }
    }
    if (char === ';') {
      const statement = sql.slice(start, index).trim()
      if (statement) statements.push(statement)
      start = index + 1
    }
    index += 1
  }
  const last = sql.slice(start).trim()
  if (last) statements.push(last)
  if (quote || dollar || blockDepth) throw new SafeDatabaseError('MIGRATION_SQL_INVALID', 'The migration contains an unterminated SQL block.')
  return statements
}

export function loadMigration() {
  const source = readFileSync(migrationUrl, 'utf8')
  const filename = fileURLToPath(migrationUrl).split('/').pop()
  const match = filename.match(/^(\d+)_(.+)\.sql$/)
  if (!match) throw new SafeDatabaseError('MIGRATION_NAME_INVALID', 'The migration filename is invalid.')
  const all = splitSqlStatements(source)
  const first = all[0]?.replace(/^(?:\s*--[^\n]*(?:\n|$))*/, '').trim().toLowerCase()
  const last = all.at(-1)?.trim().toLowerCase()
  if (first !== 'begin' || last !== 'commit') {
    throw new SafeDatabaseError('MIGRATION_TRANSACTION_INVALID', 'Expected a migration with one outer BEGIN/COMMIT transaction.')
  }
  const statements = all.slice(1, -1)
  return { version: match[1], name: match[2], statements, sql: statements.join(';\n') + ';' }
}

export async function inspectMigrationState(client, migration) {
  const extension = await client.query(`
    select n.nspname as schema_name
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto'
  `)
  if (extension.rows.length && extension.rows[0].schema_name !== 'extensions') {
    throw new SafeDatabaseError('PGCRYPTO_SCHEMA_CONFLICT', 'pgcrypto is installed outside extensions. No extension was moved; review the existing project first.')
  }
  if (!extension.rows.length) {
    const available = await client.query("select 1 from pg_catalog.pg_available_extensions where name = 'pgcrypto'")
    if (!available.rowCount) throw new SafeDatabaseError('PGCRYPTO_UNAVAILABLE', 'The database does not provide the required pgcrypto extension.')
  }

  const historyTable = await client.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present")
  let historyPresent = historyTable.rows[0].present
  let recorded = false
  if (historyPresent) {
    const columns = await client.query(`
      select a.attname as name, pg_catalog.format_type(a.atttypid, a.atttypmod) as type
      from pg_catalog.pg_attribute a
      where a.attrelid = 'supabase_migrations.schema_migrations'::regclass
        and a.attnum > 0 and not a.attisdropped
    `)
    const types = Object.fromEntries(columns.rows.map((column) => [column.name, column.type]))
    if (types.version !== 'text' || types.name !== 'text' || types.statements !== 'text[]') {
      throw new SafeDatabaseError('MIGRATION_HISTORY_LAYOUT', 'The existing Supabase migration history has an unsupported layout. It was not changed.')
    }
    const primaryKey = await client.query(`
      select exists (
        select 1
        from pg_catalog.pg_constraint c
        join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = 'version'
        where c.conrelid = 'supabase_migrations.schema_migrations'::regclass
          and c.contype = 'p' and c.conkey = array[a.attnum]
      ) as valid
    `)
    if (!primaryKey.rows[0].valid) {
      throw new SafeDatabaseError('MIGRATION_HISTORY_LAYOUT', 'The existing migration history must have a primary key on version. It was not changed.')
    }
    const existing = await client.query('select name from supabase_migrations.schema_migrations where version = $1', [migration.version])
    if (existing.rowCount) {
      if (existing.rowCount !== 1 || existing.rows[0].name !== migration.name) {
        throw new SafeDatabaseError('MIGRATION_VERSION_CONFLICT', 'This migration version is already recorded with a different name. No SQL was applied.')
      }
      recorded = true
    }
  }
  if (!recorded) {
    const existingSchema = await client.query("select 1 from pg_catalog.pg_namespace where nspname = 'voting_private'")
    if (existingSchema.rowCount) {
      throw new SafeDatabaseError('VOTING_SCHEMA_EXISTS', 'voting_private already exists without this recorded migration. Preflight and reconcile it manually; no reset was performed.')
    }
    const existingFunctions = await client.query(`
      select p.proname
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1::text[])
    `, [rpcNames])
    if (existingFunctions.rowCount) {
      throw new SafeDatabaseError('RPC_NAME_CONFLICT', 'One or more voting RPC names already exist in public. No functions were replaced.')
    }
  }
  return { recorded, historyPresent, pgcryptoPresent: Boolean(extension.rowCount) }
}

export async function verifyInstalledSchema(client) {
  const tables = await client.query(`
    select c.relname, c.relrowsecurity,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
      has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'voting_private' and c.relkind = 'r' and c.relname = any($1::text[])
  `, [privateTables])
  if (tables.rowCount !== privateTables.length || tables.rows.some((table) => !table.relrowsecurity || table.anon_select || table.authenticated_select)) {
    throw new SafeDatabaseError('SCHEMA_VERIFICATION_FAILED', 'Expected six private RLS-protected tables without browser SELECT grants.')
  }
  const schemaAccess = await client.query("select has_schema_privilege('anon', 'voting_private', 'USAGE') as anon_usage, has_schema_privilege('authenticated', 'voting_private', 'USAGE') as authenticated_usage")
  if (schemaAccess.rows[0].anon_usage || schemaAccess.rows[0].authenticated_usage) {
    throw new SafeDatabaseError('SCHEMA_ACCESS_UNSAFE', 'Browser roles unexpectedly have access to the private voting schema.')
  }
  const funcs = await client.query(`
    select p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
      pg_catalog.pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any($1::text[])
  `, [rpcNames])
  const expected = {
    get_voting_status: ['p_voter_token text', 'jsonb'],
    cast_vote: ['p_logo_id integer, p_voter_token text', 'jsonb'],
    admin_login: ['p_username text, p_password text', 'jsonb'],
    get_admin_results: ['p_session_token text', 'jsonb'],
    admin_logout: ['p_session_token text', 'void'],
  }
  if (funcs.rowCount !== rpcNames.length || funcs.rows.some((fn) =>
    fn.arguments !== expected[fn.proname][0] || fn.result !== expected[fn.proname][1]
    || !fn.prosecdef || !fn.anon_execute || !fn.proconfig?.some((value) => value === 'search_path=""' || value === 'search_path='),
  )) {
    throw new SafeDatabaseError('RPC_VERIFICATION_FAILED', 'Expected five correctly configured voting RPC functions.')
  }
  const logos = await client.query('select array_agg(id order by id) as ids from voting_private.logos')
  if (JSON.stringify(logos.rows[0].ids) !== JSON.stringify(Array.from({ length: 14 }, (_, index) => index + 1))) {
    throw new SafeDatabaseError('LOGO_SEED_INVALID', 'The database must contain exactly logo IDs 1 through 14.')
  }
  const settings = await client.query('select count(*)::integer as count from voting_private.settings where id = true')
  if (settings.rows[0].count !== 1) throw new SafeDatabaseError('SETTINGS_INVALID', 'The voting settings row is missing.')
  return { tables: tables.rowCount, functions: funcs.rowCount, logos: 14 }
}
