import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

const env = { ...parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8')), ...process.env }
const projectUrl = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!projectUrl || !key) throw new Error('Konfigurasi frontend Supabase belum lengkap di .env.local.')
const base = new URL(projectUrl)
if (base.protocol !== 'https:') throw new Error('URL API Supabase harus menggunakan HTTPS.')

async function rpc(name, params) {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, base), {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(`RPC ${name} gagal: HTTP ${response.status}, kode ${typeof payload?.code === 'string' ? payload.code : 'tidak tersedia'}.`)
    error.code = payload?.code
    throw error
  }
  if (payload?.error) throw new Error(`RPC ${name} menolak permintaan: ${payload.error}.`)
  return payload
}

try {
  const before = await rpc('get_voting_status', { p_voter_token: null })
  if (typeof before?.totalVotes !== 'number' || typeof before?.isOpen !== 'boolean') throw new Error('Respons status voting tidak sesuai kontrak aplikasi.')
  console.log(`API Supabase terhubung. Voting ${before.isOpen ? 'dibuka' : 'ditutup'}; total ${before.totalVotes} suara.`)
  if (process.argv.includes('--verify')) {
    let session
    try {
      session = await rpc('admin_login', { p_username: 'admin123', p_password: 'admin123' })
      if (!session?.token) throw new Error('Login tidak menghasilkan sesi admin.')
      const results = await rpc('get_admin_results', { p_session_token: session.token })
      if (!Array.isArray(results?.logos) || results.logos.length !== 14) throw new Error('Hasil admin tidak memuat 14 kandidat logo.')
      if (results.logos.reduce((sum, logo) => sum + logo.votes, 0) !== results.totalVotes) throw new Error('Total suara tidak sesuai dengan perolehan setiap logo.')
      console.log('Login admin dan hasil 14 logo tervalidasi melalui API publik. Tidak ada suara percobaan yang dikirim.')
    } finally {
      if (session?.token) {
        await rpc('admin_logout', { p_session_token: session.token })
        console.log('Sesi admin pengujian sudah dicabut.')
      }
    }
  }
} catch (error) {
  if (error.code === 'PGRST202') console.error('Koneksi API tersedia, tetapi fungsi voting belum terpasang. Migrasi database diperlukan.')
  else if (error.cause?.code) console.error(`Koneksi API gagal: ${error.cause.code}.`)
  else console.error(error.message)
  process.exitCode = 1
}
