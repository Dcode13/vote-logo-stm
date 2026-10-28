import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
  removeItem(key: string) { this.data.delete(key) }
}

const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
// Execute the actual data module in an isolated browser-like context. Inject
// only environment values and the Supabase transport; keep its business logic.
const compiled = stripTypeScriptTypes(source
  .replace("import { createClient } from '@supabase/supabase-js'", "const { createClient } = require('@supabase/supabase-js')")
  .replaceAll('import.meta.env', '__testEnv'))
  .replace(/^export /gm, '')
  + '\nObject.assign(exports, { isDemo, getVoterToken, getVotingStatus, castVote, loginAdmin, getResults, logoutAdmin });'

function harness(
  env: Record<string, string> = {},
  rpcResponse = { data: null, error: null } as { data: unknown; error: { message: string } | null },
  options: { constructorError?: string; randomUUID?: boolean } = {},
) {
  const localStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  const calls: { name: string; params: Record<string, unknown> }[] = []
  const exports: Record<string, any> = {}
  runInNewContext(compiled, {
    exports,
    __testEnv: env,
    localStorage,
    sessionStorage,
    crypto: {
      ...(options.randomUUID === false ? {} : { randomUUID }),
      getRandomValues: (values: Uint8Array) => { values.set(randomBytes(values.length)); return values },
    },
    require: () => ({ createClient: () => {
      if (options.constructorError) throw new Error(options.constructorError)
      return { rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params })
      return rpcResponse
      } }
    } }),
  })
  return { api: exports, localStorage, sessionStorage, calls }
}

test('demo starts empty, saves one vote, persists its token, and rejects a duplicate', async () => {
  const { api } = harness()
  assert.equal(api.isDemo, true)
  const token = api.getVoterToken()
  assert.equal(api.getVoterToken(), token)
  assert.equal((await api.getVotingStatus(token)).totalVotes, 0)
  const voted = await api.castVote(7, token)
  assert.equal(voted.totalVotes, 1)
  assert.equal(voted.votedLogoId, 7)
  assert.equal(voted.hasVoted, true)
  await assert.rejects(api.castVote(8, token), /sudah tercatat/)
  assert.equal((await api.getVotingStatus(token)).totalVotes, 1)
})

test('invalid logos and voter tokens cannot cast a vote', async () => {
  const { api } = harness()
  const token = api.getVoterToken()
  await assert.rejects(api.castVote(15, token), /Logo yang dipilih tidak valid/)
  await assert.rejects(api.castVote(1.5, token), /Logo yang dipilih tidak valid/)
  await assert.rejects(api.castVote(2, 'short'), /Identitas browser tidak valid/)
  assert.equal((await api.getVotingStatus(token)).totalVotes, 0)
})

test('results require a valid session, count all 14 logos, and reject logged-out sessions', async () => {
  const { api } = harness()
  await assert.rejects(api.getResults('invented-token'), /Sesi admin telah berakhir/)
  await assert.rejects(api.getResults('constructor'), /Sesi admin telah berakhir/)
  await assert.rejects(api.loginAdmin('admin123', 'wrong'), /Username atau kata sandi salah/)
  const session = await api.loginAdmin('admin123', 'admin123')
  await api.castVote(3, api.getVoterToken())
  const results = await api.getResults(session.token)
  assert.equal(results.totalVotes, 1)
  assert.equal(results.logos.length, 14)
  assert.equal(results.logos.find((logo: { id: number }) => logo.id === 3).votes, 1)
  await api.logoutAdmin(session.token)
  await assert.rejects(api.getResults(session.token), /Sesi admin telah berakhir/)
})

test('expired demo sessions and excessive login attempts are rejected', async () => {
  const { api, sessionStorage } = harness()
  const session = await api.loginAdmin('admin123', 'admin123')
  sessionStorage.setItem('stm56:demo-admin-sessions', JSON.stringify({ [session.token]: '2000-01-01T00:00:00.000Z' }))
  await assert.rejects(api.getResults(session.token), /Sesi admin telah berakhir/)
  sessionStorage.removeItem('stm56:demo-login-attempts')
  for (let index = 0; index < 10; index += 1) {
    await assert.rejects(api.loginAdmin('admin123', 'wrong'), /Username atau kata sandi salah/)
  }
  await assert.rejects(api.loginAdmin('admin123', 'admin123'), /Terlalu banyak percobaan/)
})

test('partial configuration fails explicitly instead of entering demo', async () => {
  const { api } = harness({ VITE_SUPABASE_URL: 'https://example.supabase.co' })
  assert.equal(api.isDemo, false)
  await assert.rejects(api.castVote(2, api.getVoterToken()), /Konfigurasi Supabase belum lengkap/)
})

test('a Supabase constructor error becomes a UI-friendly configuration error without entering demo', async () => {
  const { api, localStorage } = harness(
    { VITE_SUPABASE_URL: 'invalid-url', VITE_SUPABASE_ANON_KEY: 'public-test-key' },
    undefined,
    { constructorError: 'Invalid supabaseUrl' },
  )
  assert.equal(api.isDemo, false)
  await assert.rejects(api.getVotingStatus(api.getVoterToken()), /Konfigurasi Supabase tidak valid/)
  await assert.rejects(api.loginAdmin('admin123', 'admin123'), /Konfigurasi Supabase tidak valid/)
  assert.equal(localStorage.getItem('stm56:demo-votes'), null)
})

test('LAN HTTP without randomUUID can still create secure voter and demo session tokens', async () => {
  const { api } = harness({}, undefined, { randomUUID: false })
  const voterToken = api.getVoterToken()
  assert.match(voterToken, /^[a-f0-9]{64}$/)
  assert.equal(api.getVoterToken(), voterToken)
  const session = await api.loginAdmin('admin123', 'admin123')
  assert.match(session.token, /^[a-f0-9]{64}$/)
  assert.notEqual(session.token, voterToken)
  await api.castVote(2, voterToken)
  assert.equal((await api.getResults(session.token)).totalVotes, 1)
})

test('configured Supabase uses RPC and does not store demo votes after a network failure', async () => {
  const { api, localStorage, calls } = harness(
    { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-test-key' },
    { data: null, error: { message: 'Failed to fetch' } },
  )
  assert.equal(api.isDemo, false)
  const token = api.getVoterToken()
  await assert.rejects(api.castVote(2, token), /Koneksi ke server terputus/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'cast_vote')
  assert.equal(calls[0].params.p_logo_id, 2)
  assert.equal(calls[0].params.p_voter_token, token)
  assert.equal(localStorage.getItem('stm56:demo-votes'), null)
})

test('failed login JSON returned by the database is treated as an error', async () => {
  const { api } = harness(
    { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-test-key' },
    { data: { error: 'INVALID_CREDENTIALS' }, error: null },
  )
  await assert.rejects(api.loginAdmin('admin123', 'wrong'), /Username atau kata sandi salah/)
})
