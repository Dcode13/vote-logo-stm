import { randomBytes } from 'node:crypto'
import { createDatabaseClient, inspectMigrationState, loadMigration, reportDatabaseError, SafeDatabaseError, verifyInstalledSchema } from './db-config.mjs'

function assertCheck(condition, code, message) {
  if (!condition) throw new SafeDatabaseError(code, message)
}

let savepointIndex = 0
async function expectDatabaseRejection(client, query, parameters, expectedCode, expectedMessage) {
  const savepoint = `stm56_expected_rejection_${++savepointIndex}`
  await client.query(`SAVEPOINT ${savepoint}`)
  let rejection
  try { await client.query(query, parameters) } catch (error) { rejection = error }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  await client.query(`RELEASE SAVEPOINT ${savepoint}`)
  assertCheck(
    rejection?.code === expectedCode && (!expectedMessage || rejection.message === expectedMessage),
    'EXPECTED_REJECTION_MISSING',
    'A database permission or validation check did not reject the test request as expected.',
  )
}

let client, transaction = false
try {
  if (process.argv.length > 2) throw new SafeDatabaseError('INVALID_ARGUMENT', 'This verification script does not accept arguments.')
  client = createDatabaseClient()
  await client.connect()
  // Repeatable read prevents concurrent real votes from changing the baseline
  // while these temporary test rows are being checked.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  transaction = true
  await client.query("SET LOCAL lock_timeout = '5s'")
  await client.query("SET LOCAL statement_timeout = '30s'")
  const state = await inspectMigrationState(client, loadMigration())
  assertCheck(state.recorded, 'MIGRATION_NOT_RECORDED', 'Apply the migration before running database verification.')
  const schema = await verifyInstalledSchema(client)
  const checks = ['schema_and_rpc_permissions', 'fourteen_logo_seed']

  const voterToken = randomBytes(32).toString('hex')
  const initial = (await client.query('select public.get_voting_status($1) as data', [voterToken])).rows[0].data
  assertCheck(initial.hasVoted === false && initial.votedLogoId === null && Number.isInteger(initial.totalVotes), 'STATUS_CHECK_FAILED', 'The public voting status response is invalid.')
  checks.push('public_status')

  await expectDatabaseRejection(client, 'select public.get_admin_results($1)', ['invalid-session'], 'P0001', 'SESSION_EXPIRED')
  await expectDatabaseRejection(client, 'select public.cast_vote($1, $2)', [15, voterToken], 'P0001', 'INVALID_LOGO')
  await expectDatabaseRejection(client, 'select public.cast_vote($1, $2)', [1, 'short'], 'P0001', 'INVALID_VOTER_TOKEN')
  checks.push('invalid_session_rejected', 'invalid_vote_rejected')

  if (initial.isOpen) {
    const voted = (await client.query('select public.cast_vote($1, $2) as data', [1, voterToken])).rows[0].data
    assertCheck(voted.hasVoted === true && voted.votedLogoId === 1 && voted.totalVotes === initial.totalVotes + 1, 'CAST_VOTE_CHECK_FAILED', 'The temporary vote was not recorded correctly.')
    await expectDatabaseRejection(client, 'select public.cast_vote($1, $2)', [2, voterToken], 'P0001', 'ALREADY_VOTED')
    const hashedVote = (await client.query("select count(*)::integer as count from voting_private.votes where voter_hash = encode(extensions.digest($1, 'sha256'), 'hex') and voter_hash <> $1", [voterToken])).rows[0].count
    assertCheck(hashedVote === 1, 'VOTER_HASH_CHECK_FAILED', 'The temporary voter identifier was not stored as a hash.')
    checks.push('temporary_vote', 'duplicate_vote_rejected', 'voter_hash')
  } else {
    await expectDatabaseRejection(client, 'select public.cast_vote($1, $2)', [1, voterToken], 'P0001', 'VOTING_CLOSED')
    checks.push('closed_voting_rejected')
  }

  const invalidLogin = (await client.query('select public.admin_login($1, $2) as data', ['admin123', 'incorrect-test-password'])).rows[0].data
  assertCheck(invalidLogin.error === 'INVALID_CREDENTIALS', 'INVALID_LOGIN_CHECK_FAILED', 'Incorrect admin credentials were not rejected, or the account is temporarily rate limited.')
  const session = (await client.query('select public.admin_login($1, $2) as data', ['admin123', 'admin123'])).rows[0].data
  assertCheck(typeof session.token === 'string' && /^[a-f0-9]{64}$/.test(session.token) && Date.parse(session.expiresAt) > Date.now(), 'ADMIN_LOGIN_CHECK_FAILED', 'The requested initial admin credentials did not create a valid session. Existing customized credentials are preserved.')
  const passwordHash = (await client.query("select password_hash <> $1 and extensions.crypt($1, password_hash) = password_hash as valid from voting_private.admins where username = $2", ['admin123', 'admin123'])).rows[0]?.valid
  assertCheck(passwordHash === true, 'PASSWORD_HASH_CHECK_FAILED', 'The admin password is not stored as a valid password hash.')
  const hashedSession = (await client.query("select count(*)::integer as count from voting_private.admin_sessions where token_hash = encode(extensions.digest($1, 'sha256'), 'hex') and token_hash <> $1 and expires_at > now()", [session.token])).rows[0].count
  assertCheck(hashedSession === 1, 'SESSION_HASH_CHECK_FAILED', 'The temporary session token was not stored as a hash.')
  checks.push('incorrect_login_rejected', 'admin_login', 'password_hash', 'session_hash')

  const results = (await client.query('select public.get_admin_results($1) as data', [session.token])).rows[0].data
  const expectedTotal = initial.totalVotes + (initial.isOpen ? 1 : 0)
  assertCheck(results.totalVotes === expectedTotal && Array.isArray(results.logos) && results.logos.length === 14 && results.logos.reduce((sum, logo) => sum + logo.votes, 0) === expectedTotal, 'RESULTS_CHECK_FAILED', 'Admin results do not match the temporary vote snapshot.')
  checks.push('admin_results')

  // Exercise RPC grants as the actual browser database role. The nested
  // savepoint restores the original database role before continuing.
  await client.query('SAVEPOINT stm56_anonymous_access')
  await client.query('SET LOCAL ROLE anon')
  const anonStatus = (await client.query('select public.get_voting_status($1) as data', [voterToken])).rows[0].data
  assertCheck(anonStatus.totalVotes === expectedTotal, 'ANON_RPC_CHECK_FAILED', 'Anonymous visitors cannot read the permitted public status RPC.')
  const anonResults = (await client.query('select public.get_admin_results($1) as data', [session.token])).rows[0].data
  assertCheck(anonResults.totalVotes === expectedTotal, 'ADMIN_RPC_CHECK_FAILED', 'A valid admin session cannot access the results RPC through the browser database role.')
  await expectDatabaseRejection(client, 'select * from voting_private.votes limit 1', [], '42501')
  await expectDatabaseRejection(client, 'select public.get_admin_results($1)', ['invalid-session'], 'P0001', 'SESSION_EXPIRED')
  await client.query('ROLLBACK TO SAVEPOINT stm56_anonymous_access')
  await client.query('RELEASE SAVEPOINT stm56_anonymous_access')
  checks.push('anonymous_rpc_access', 'anonymous_raw_table_access_rejected')

  await client.query('select public.admin_logout($1)', [session.token])
  await expectDatabaseRejection(client, 'select public.get_admin_results($1)', [session.token], 'P0001', 'SESSION_EXPIRED')
  checks.push('logout_revokes_session')

  // No fake vote, admin session, or login-attempt row is committed. PostgreSQL
  // identity sequences can advance on a rolled-back INSERT; gaps are harmless.
  await client.query('ROLLBACK')
  transaction = false
  console.log(JSON.stringify({ status: 'verified', schema, checks, testRowsRolledBack: true, votingOpen: initial.isOpen }))
} catch (error) {
  if (transaction && client) { try { await client.query('ROLLBACK') } catch {} }
  reportDatabaseError(error)
  process.exitCode = 1
} finally {
  if (client) { try { await client.end() } catch {} }
}
