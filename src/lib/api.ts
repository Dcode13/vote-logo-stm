import { createClient } from '@supabase/supabase-js'
import type { AdminSession, Results, VotingStatus } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

/** Demo is used only when BOTH configuration values are absent. */
export const isDemo = !supabaseUrl && !supabaseKey

let configurationError = ''
const client = (() => {
  if (isDemo) return null
  if (!supabaseUrl || !supabaseKey) {
    configurationError = 'Konfigurasi Supabase belum lengkap. Isi URL dan publishable/anon key di .env.local.'
    return null
  }
  try {
    return createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  } catch {
    configurationError = 'Konfigurasi Supabase tidak valid. Periksa URL project serta publishable/anon key di .env.local.'
    return null
  }
})()

const VOTER_KEY = 'stm56:voter-token'
const DEMO_VOTES_KEY = 'stm56:demo-votes'
const DEMO_SESSIONS_KEY = 'stm56:demo-admin-sessions'
const DEMO_ATTEMPTS_KEY = 'stm56:demo-login-attempts'

type DemoVote = { logoId: number; voterToken: string }
type DemoSessions = Record<string, string>

function readStorage<T>(storage: Storage, key: string, fallback: T): T {
  const value = storage.getItem(key)
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    throw new Error('Data lokal tidak terbaca. Muat ulang halaman atau bersihkan data situs ini.')
  }
}

function getDemoVotes(): DemoVote[] {
  const votes = readStorage<DemoVote[]>(localStorage, DEMO_VOTES_KEY, [])
  if (!Array.isArray(votes)) throw new Error('Data demo tidak valid. Bersihkan data situs ini.')
  return votes.filter((vote) => Number.isInteger(vote?.logoId) && vote.logoId >= 1 && vote.logoId <= 14 && typeof vote.voterToken === 'string')
}

function errorMessage(message: string): string {
  if (message.includes('ALREADY_VOTED')) return 'Suara dari browser ini sudah tercatat. Terima kasih telah berpartisipasi!'
  if (message.includes('VOTING_CLOSED')) return 'Periode voting sudah ditutup.'
  if (message.includes('INVALID_LOGO')) return 'Logo yang dipilih tidak valid.'
  if (message.includes('INVALID_VOTER_TOKEN')) return 'Identitas browser tidak valid. Silakan muat ulang halaman.'
  if (message.includes('SESSION_EXPIRED')) return 'Sesi admin telah berakhir. Silakan masuk kembali.'
  if (message.includes('TOO_MANY_ATTEMPTS')) return 'Terlalu banyak percobaan masuk. Coba lagi dalam satu menit.'
  if (message.includes('INVALID_CREDENTIALS')) return 'Username atau kata sandi salah.'
  if (/fetch|network|timeout/i.test(message)) return 'Koneksi ke server terputus. Periksa internet Anda dan coba lagi.'
  return 'Server belum dapat memproses permintaan. Coba lagi atau periksa konfigurasi Supabase.'
}

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  if (!client) throw new Error(configurationError || 'Konfigurasi Supabase belum lengkap. Isi URL dan publishable/anon key di .env.local.')
  const { data, error } = await client.rpc(name, params)
  if (error) throw new Error(errorMessage(error.message))
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(errorMessage(String(data.error)))
  }
  return data as T
}

function createRandomToken(): string {
  const browserCrypto = globalThis.crypto
  if (typeof browserCrypto?.randomUUID === 'function') return browserCrypto.randomUUID()
  // randomUUID requires a secure context. getRandomValues remains available
  // on ordinary HTTP LAN previews and still supplies cryptographic randomness.
  if (typeof browserCrypto?.getRandomValues !== 'function') {
    throw new Error('Browser ini belum mendukung identitas voting yang aman. Gunakan browser terbaru atau buka melalui HTTPS.')
  }
  const bytes = browserCrypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function getVoterToken(): string {
  let token = localStorage.getItem(VOTER_KEY)
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    token = createRandomToken()
    localStorage.setItem(VOTER_KEY, token)
  }
  return token
}

export async function getVotingStatus(voterToken: string): Promise<VotingStatus> {
  if (!isDemo) return rpc<VotingStatus>('get_voting_status', { p_voter_token: voterToken })
  const votes = getDemoVotes()
  const ownVote = votes.find((vote) => vote.voterToken === voterToken)
  return {
    totalVotes: votes.length,
    hasVoted: Boolean(ownVote),
    votedLogoId: ownVote?.logoId ?? null,
    isOpen: true,
  }
}

export async function castVote(logoId: number, voterToken: string): Promise<VotingStatus> {
  if (!Number.isInteger(logoId) || logoId < 1 || logoId > 14) throw new Error(errorMessage('INVALID_LOGO'))
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(voterToken)) throw new Error(errorMessage('INVALID_VOTER_TOKEN'))
  if (!isDemo) return rpc<VotingStatus>('cast_vote', { p_logo_id: logoId, p_voter_token: voterToken })

  // The localStorage read and write run synchronously in this tab. The live
  // database enforces duplicate prevention atomically through a unique index.
  const votes = getDemoVotes()
  if (votes.some((vote) => vote.voterToken === voterToken)) throw new Error(errorMessage('ALREADY_VOTED'))
  votes.push({ logoId, voterToken })
  localStorage.setItem(DEMO_VOTES_KEY, JSON.stringify(votes))
  return getVotingStatus(voterToken)
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  if (!isDemo) return rpc<AdminSession>('admin_login', { p_username: username, p_password: password })

  const now = Date.now()
  const attempts = readStorage<{ startedAt: number; count: number }>(sessionStorage, DEMO_ATTEMPTS_KEY, { startedAt: now, count: 0 })
  if (now - attempts.startedAt >= 60_000) {
    attempts.startedAt = now
    attempts.count = 0
  }
  attempts.count += 1
  sessionStorage.setItem(DEMO_ATTEMPTS_KEY, JSON.stringify(attempts))
  if (attempts.count > 10) throw new Error(errorMessage('TOO_MANY_ATTEMPTS'))
  if (username.trim().toLowerCase() !== 'admin123' || password !== 'admin123') throw new Error(errorMessage('INVALID_CREDENTIALS'))

  const session: AdminSession = {
    token: createRandomToken(),
    expiresAt: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
  }
  const sessions = readStorage<DemoSessions>(sessionStorage, DEMO_SESSIONS_KEY, {})
  for (const [token, expiry] of Object.entries(sessions)) {
    if (new Date(expiry).getTime() <= now) delete sessions[token]
  }
  sessions[session.token] = session.expiresAt
  sessionStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(sessions))
  return session
}

export async function getResults(token: string): Promise<Results> {
  if (!isDemo) return rpc<Results>('get_admin_results', { p_session_token: token })
  const sessions = readStorage<DemoSessions>(sessionStorage, DEMO_SESSIONS_KEY, {})
  const expiry = sessions[token]
  const expiryTime = typeof expiry === 'string' ? Date.parse(expiry) : Number.NaN
  if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) throw new Error(errorMessage('SESSION_EXPIRED'))
  const votes = getDemoVotes()
  return {
    totalVotes: votes.length,
    logos: Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      votes: votes.filter((vote) => vote.logoId === index + 1).length,
    })),
    lastUpdated: new Date().toISOString(),
  }
}

export async function logoutAdmin(token: string): Promise<void> {
  if (!isDemo) {
    await rpc<null>('admin_logout', { p_session_token: token })
    return
  }
  const sessions = readStorage<DemoSessions>(sessionStorage, DEMO_SESSIONS_KEY, {})
  delete sessions[token]
  sessionStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(sessions))
}
