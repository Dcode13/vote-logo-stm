import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Award, BarChart3, Check, Clock3, Download, LayoutDashboard, LoaderCircle, LogOut, Medal, RefreshCw, ShieldCheck, Trophy, UsersRound, Vote } from 'lucide-react'
import { getResults, isDemo } from '../lib/api'
import { rankLogos, resultsToCsv } from '../lib/results'
import type { AdminSession, Results } from '../lib/types'
import LogoImage from '../components/LogoImage'

export default function ResultsPage({ session, onLogout, onExpired }: { session: AdminSession; onLogout: () => Promise<void>; onExpired: () => void }) {
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshed, setRefreshed] = useState(false)
  const [exported, setExported] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  async function handleLogout() {
    setLoggingOut(true)
    try { await onLogout() } finally { setLoggingOut(false) }
  }
  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (Date.parse(session.expiresAt) <= Date.now()) { onExpired(); return false }
      const data = await getResults(session.token)
      setResults(data); setError('')
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Gagal memuat hasil voting.'
      if (message.includes('Sesi admin')) onExpired()
      else setError(message)
      return false
    } finally { setLoading(false) }
  }, [session.token, session.expiresAt, onExpired])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    const onStorage = () => void load()
    window.addEventListener('storage', onStorage)
    return () => { clearInterval(timer); window.removeEventListener('storage', onStorage) }
  }, [load])
  useEffect(() => { if (refreshed) { const timer = setTimeout(() => setRefreshed(false), 2200); return () => clearTimeout(timer) } }, [refreshed])
  useEffect(() => { if (exported) { const timer = setTimeout(() => setExported(false), 2500); return () => clearTimeout(timer) } }, [exported])

  const ranking = useMemo(() => results ? rankLogos(results) : [], [results])
  const leader = ranking[0]
  const hasVotes = Boolean(results && results.totalVotes > 0)
  const tiedLeaders = hasVotes ? ranking.filter((logo) => logo.votes === leader?.votes).length : 0
  const lastUpdated = results ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Makassar' }).format(new Date(results.lastUpdated)) : '—'

  function download() {
    if (!results) return
    const url = URL.createObjectURL(new Blob([resultsToCsv(results)], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url; link.download = `hasil-voting-stm56-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExported(true)
  }

  return <div className="dashboard-shell section-shell">
    <aside className="dashboard-sidebar"><span className="eyebrow">WORKSPACE PANITIA</span><nav aria-label="Navigasi admin"><a className="sidebar-active" href="#hasil"><LayoutDashboard size={18} /> Ringkasan hasil <span className="status-dot" /></a><a href="#kandidat"><Vote size={18} /> Halaman voting <ArrowUpRight size={15} /></a></nav><div className="sidebar-anniversary"><img src="/school-logo.webp" alt="Logo SMK Negeri 3 Gorontalo" width="80" height="78" /><p>Satu almamater.<br />Banyak cerita.</p><small>STM · GORONTALO · 2026</small></div><div className="sidebar-user"><div className="admin-avatar">A</div><div><strong>Administrator</strong><span>Panitia HUT ke-56</span></div><ShieldCheck size={17} /></div><button className="sidebar-logout" disabled={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />} Keluar dashboard</button></aside>
    <main className="dashboard-main" id="main-content" tabIndex={-1}>
      <div className="dashboard-breadcrumb">Dashboard <span>/</span> <strong>Hasil voting</strong></div>
      <div className="dashboard-heading"><div><div className="eyebrow">SETIAP SUARA, SATU CERITA</div><h1>Suara almamater<span className="text-brand">.</span></h1><p>Pantau pilihan kita untuk wajah perayaan ke-56 STM.</p></div><button className="button button-secondary export-button" onClick={download} disabled={!results}>{exported ? <Check size={16} /> : <Download size={16} />}{exported ? 'Berhasil diekspor' : 'Ekspor CSV'}</button></div>
      <div className="dashboard-update"><span><span className="status-dot" /> {isDemo ? 'DATA DEMO LOKAL' : 'TERHUBUNG KE SUPABASE'}</span><span><Clock3 size={13} /> {lastUpdated} WITA <span className="update-label">· Pembaruan tiap 15 detik</span></span><button aria-label="Perbarui hasil voting" onClick={async () => { setRefreshed(await load()) }} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} />{refreshed ? 'Diperbarui' : 'Perbarui'}</button></div>
      {error && <div className="error-box dashboard-error" role="alert">{error}<button className="text-button" onClick={() => void load()}>Coba lagi <RefreshCw size={14} /></button></div>}
      <div className="dashboard-stats"><div className="dashboard-stat"><span className="dashboard-stat-icon"><UsersRound size={20} /></span><span>Total suara masuk</span><strong>{results ? results.totalVotes.toLocaleString('id-ID') : '—'}<small>suara</small></strong><p>Setiap partisipasi sangat berarti</p></div><div className="dashboard-stat"><span className="dashboard-stat-icon blue"><BarChart3 size={20} /></span><span>Kandidat logo</span><strong>14<small>karya</small></strong><p>Beragam ide, satu identitas</p></div><div className="dashboard-stat highlight-stat"><span className="dashboard-stat-icon"><Trophy size={20} /></span><span>{tiedLeaders > 1 ? 'Posisi teratas bersama' : 'Logo teratas sementara'}</span><strong>{hasVotes ? tiedLeaders > 1 ? `${tiedLeaders} logo` : `Logo ${String(leader.id).padStart(2, '0')}` : 'Belum ada'}</strong><p>{hasVotes ? `${leader.votes.toLocaleString('id-ID')} suara · ${leader.percentage.toFixed(1)}% dari total suara` : 'Menunggu suara pertama'}</p></div></div>

      {hasVotes && <div className="podium-section"><div className="panel-heading"><h2><Medal size={19} /> Tiga posisi teratas</h2><span className="outline-tag">PERINGKAT SEMENTARA</span></div><div className="podium-grid">{ranking.slice(0, 3).map((logo, i) => <div className={`podium-card podium-${i}`} key={logo.id}><span className="podium-position"><Award size={15} />{logo.rank ? `#${logo.rank}` : '—'}</span><LogoImage id={logo.id} /><div><strong>Logo {String(logo.id).padStart(2, '0')}</strong><span>{logo.votes.toLocaleString('id-ID')} suara <span className="podium-percentage">{logo.percentage.toFixed(1)}%</span></span></div></div>)}</div></div>}

      <section className="results-panel" aria-labelledby="chart-title"><div className="panel-heading"><div><h2 id="chart-title"><BarChart3 size={19} /> Sebaran suara</h2><p>Perbandingan perolehan seluruh kandidat logo.</p></div><span className="chart-legend"><span /> Jumlah suara</span></div>{loading && !results ? <div className="loading-panel"><LoaderCircle size={25} className="spin" /><p>Memuat perolehan suara...</p></div> : !results ? <div className="empty-state"><BarChart3 size={30} /><h3>Data belum tersedia</h3><p>Coba perbarui setelah koneksi kembali tersedia.</p></div> : <div className="vote-chart" role="img" aria-label={`Grafik perolehan ${results.totalVotes} suara pada 14 logo. Detail tersedia dalam tabel di bawah.`}>{ranking.map((logo) => <div className="chart-row" key={logo.id}><span className="chart-label">Logo {String(logo.id).padStart(2, '0')}</span><div className="chart-track"><div className={`chart-bar ${logo.rank === 1 ? 'chart-bar-leader' : ''}`} style={{ width: `${hasVotes ? (logo.votes / (leader.votes || 1)) * 100 : 0}%` }} /></div><strong>{logo.votes.toLocaleString('id-ID')}</strong></div>)}</div>}{results && !hasVotes && <p className="chart-empty-note">Belum ada suara masuk. Grafik akan diperbarui saat voting dimulai.</p>}</section>

      <section className="results-panel ranking-panel" aria-labelledby="ranking-title"><div className="panel-heading"><div><h2 id="ranking-title"><Trophy size={19} /> Peringkat lengkap</h2><p>Diurutkan berdasarkan jumlah suara terbanyak.</p></div><span className="outline-tag">14 KANDIDAT</span></div><div className="table-scroll"><table className="ranking-table"><thead><tr><th scope="col">Peringkat</th><th scope="col">Kandidat logo</th><th scope="col">Suara</th><th scope="col">Persentase</th></tr></thead><tbody>{ranking.map((logo) => <tr key={logo.id} className={logo.rank === 1 ? 'leading-row' : ''}><td><span className={`rank-badge ${logo.rank === 1 ? 'rank-first' : ''}`}>{logo.rank === 1 ? <Trophy size={16} /> : logo.rank ? `#${logo.rank}` : '—'}</span></td><td><div className="table-logo"><span><LogoImage id={logo.id} /></span><div><strong>Logo {String(logo.id).padStart(2, '0')}</strong><small>HUT ke-56 STM</small></div>{logo.rank === 1 && <span className="leader-label">TERATAS</span>}</div></td><td><strong>{logo.votes.toLocaleString('id-ID')}</strong></td><td><div className="table-percentage"><div><span style={{ width: `${logo.percentage}%` }} /></div><span>{logo.percentage.toFixed(1)}%</span></div></td></tr>)}</tbody></table></div>{results && <div className="table-footer"><span>Total 14 kandidat logo</span><strong>{results.totalVotes.toLocaleString('id-ID')} suara terkumpul</strong></div>}</section>
      <div className="dashboard-bottom"><ShieldCheck size={15} /><p>Peringkat bersifat sementara. Jumlah suara yang sama memiliki peringkat yang sama.</p><a href="#kandidat"><ArrowLeft size={14} /> Kembali ke voting</a></div>
    </main>
  </div>
}
