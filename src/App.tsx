import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, ExternalLink, Fingerprint, Heart, LoaderCircle, LockKeyhole, Menu, ShieldCheck, Sparkles, X } from 'lucide-react'
import Brand from './components/Brand'
import LogoImage from './components/LogoImage'
import Modal from './components/Modal'
import LoginModal from './components/LoginModal'
import VotingPage from './pages/VotingPage'
import ResultsPage from './pages/ResultsPage'
import { castVote, getVotingStatus, getVoterToken, isDemo, logoutAdmin } from './lib/api'
import type { AdminSession, VotingStatus } from './lib/types'

const SESSION_KEY = 'stm56:admin-session'
function readSession(): AdminSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
    return value && typeof value.token === 'string' && Date.parse(value.expiresAt) > Date.now() ? value : null
  } catch { return null }
}
type Selection = { id: number; stage: 'preview' | 'confirm' | 'success' }

export default function App() {
  const [screen, setScreen] = useState(window.location.hash === '#hasil' ? 'results' : 'voting')
  const [session, setSession] = useState<AdminSession | null>(readSession)
  const [loginOpen, setLoginOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [status, setStatus] = useState<VotingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [voteError, setVoteError] = useState('')
  const [voting, setVoting] = useState(false)
  const [authNotice, setAuthNotice] = useState('')
  const statusRequest = useRef(0)

  const loadStatus = useCallback(async () => {
    const request = ++statusRequest.current
    try {
      const nextStatus = await getVotingStatus(getVoterToken())
      if (request === statusRequest.current) { setStatus(nextStatus); setError('') }
    }
    catch (cause) { if (request === statusRequest.current) { setError(cause instanceof Error ? cause.message : 'Gagal memuat status voting.'); setStatus(null) } }
    finally { if (request === statusRequest.current) setLoading(false) }
  }, [])

  useEffect(() => {
    void loadStatus()
    const interval = setInterval(() => void loadStatus(), 30_000)
    window.addEventListener('storage', loadStatus)
    return () => { clearInterval(interval); window.removeEventListener('storage', loadStatus) }
  }, [loadStatus])
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#main-content') return
      const isResults = window.location.hash === '#hasil'
      setScreen(isResults ? 'results' : 'voting'); setMobileMenu(false)
      if (isResults || !window.location.hash) window.scrollTo({ top: 0 })
      else requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => { document.title = screen === 'results' ? 'Hasil Voting · 56 Tahun STM' : '56 Tahun STM · Voting Logo SMK Negeri 3 Gorontalo' }, [screen])

  const openAdmin = useCallback(() => {
    setMobileMenu(false); setAuthNotice('')
    if (session && Date.parse(session.expiresAt) > Date.now()) window.location.hash = 'hasil'
    else setLoginOpen(true)
  }, [session])
  const closeLogin = useCallback(() => setLoginOpen(false), [])
  const closeSelection = useCallback(() => { setSelection(null); setVoteError('') }, [])
  const expire = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY); setSession(null); setAuthNotice('Sesi admin telah berakhir. Silakan masuk kembali.'); setLoginOpen(true)
  }, [])

  function loggedIn(value: AdminSession) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); setSession(value); setLoginOpen(false); setAuthNotice(''); window.location.hash = 'hasil'
  }
  async function logOut() {
    if (!session) return
    try {
      await logoutAdmin(session.token)
      sessionStorage.removeItem(SESSION_KEY); setSession(null); window.location.hash = ''; setAuthNotice('Kamu sudah keluar dari dashboard admin.')
    } catch (cause) {
      setAuthNotice(cause instanceof Error ? cause.message : 'Gagal keluar. Coba lagi.')
    }
  }
  function selectLogo(id: number, preview = false) { setVoteError(''); setSelection({ id, stage: preview ? 'preview' : 'confirm' }) }
  async function confirmVote() {
    if (!selection || voting || status?.hasVoted || !status?.isOpen) return
    setVoting(true); setVoteError(''); ++statusRequest.current
    try {
      const recordedStatus = await castVote(selection.id, getVoterToken())
      ++statusRequest.current
      setStatus(recordedStatus); setError(''); setSelection({ id: selection.id, stage: 'success' })
    } catch (cause) {
      setVoteError(cause instanceof Error ? cause.message : 'Suara gagal dikirim. Silakan coba lagi.')
      void loadStatus()
    } finally { setVoting(false) }
  }

  return <>
    <a className="skip-link" href={screen === 'results' ? '#main-content' : '#kandidat'} onClick={(event) => { if (screen === 'results') { event.preventDefault(); document.getElementById('main-content')?.focus(); document.getElementById('main-content')?.scrollIntoView() } }}>Lewati ke konten utama</a>
    {isDemo && <div className="demo-banner"><Sparkles size={13} /><span><strong>Mode demo</strong><span className="demo-divider">—</span>Suara disimpan di browser ini. Hubungkan Supabase untuk voting bersama.</span><span className="demo-indicator">LOKAL</span></div>}
    <header className="site-header"><div className="header-inner section-shell"><Brand /><nav className="desktop-nav" aria-label="Navigasi utama"><a href="#kandidat" className={screen === 'voting' ? 'nav-active' : ''}>Voting Logo</a><a href="#panduan">Panduan Voting</a></nav><button className="icon-button mobile-menu-toggle" aria-label={mobileMenu ? 'Tutup menu navigasi' : 'Buka menu navigasi'} aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={22} /> : <Menu size={22} />}</button></div>{mobileMenu && <nav className="mobile-nav" aria-label="Navigasi seluler"><a href="#kandidat" onClick={() => setMobileMenu(false)}>Voting Logo <ArrowRight size={16} /></a><a href="#panduan" onClick={() => setMobileMenu(false)}>Panduan Voting <ArrowRight size={16} /></a></nav>}</header>
    {authNotice && <div className="notice-banner section-shell" role="status"><ShieldCheck size={17} /><p>{authNotice}</p><button className="icon-button" onClick={() => setAuthNotice('')} aria-label="Tutup pemberitahuan"><X size={16} /></button></div>}
    {error && screen === 'voting' && <div className="error-banner section-shell" role="alert"><CircleAlert size={19} /><p>{error}</p><button onClick={() => { setLoading(true); void loadStatus() }}>Coba lagi <ArrowRight size={14} /></button></div>}
    {screen === 'voting' ? <main><VotingPage status={status} onSelect={selectLogo} loading={loading} /></main> : session ? <ResultsPage session={session} onLogout={logOut} onExpired={expire} /> : <main className="protected-page section-shell" id="main-content"><div className="dialog-symbol"><LockKeyhole size={28} /></div><span className="eyebrow">KHUSUS PANITIA</span><h1>Ruang suara almamater<span className="text-brand">.</span></h1><p>Masuk sebagai admin untuk melihat peringkat dan perolehan suara setiap logo.</p><button className="button button-primary" onClick={openAdmin}>Masuk dashboard <ArrowRight size={18} /></button><a href="#kandidat" className="text-button"><ArrowLeft size={15} /> Kembali ke voting</a></main>}
    <footer className="site-footer section-shell"><div className="footer-top"><Brand small /><p>Merayakan perjalanan.<br /><strong>Merangkai masa depan.</strong></p><span className="footer-anniversary">1970 <span>——</span> 2026</span></div><div className="footer-bottom"><span>© 2026 Panitia HUT ke-56 STM – SMK Negeri 3 Gorontalo.</span><span>Dibuat dengan <Heart size={12} /> untuk almamater.</span></div></footer>

    {loginOpen && <LoginModal onClose={closeLogin} onLogin={loggedIn} />}
    {selection && <Modal title={selection.stage === 'success' ? 'Suara berhasil tercatat' : selection.stage === 'preview' ? `Detail Logo ${selection.id}` : 'Konfirmasi pilihan logo'} onClose={closeSelection} busy={voting} className={`vote-modal ${selection.stage === 'success' ? 'success-modal' : ''}`}>
      {selection.stage === 'success' ? <><div className="success-check"><CheckCheck size={36} /></div><span className="eyebrow">SATU SUARA, BANYAK MAKNA</span><h3>Suaramu berarti<span className="text-brand">.</span></h3><p className="dialog-description">Pilihanmu untuk <strong>Logo {String(selection.id).padStart(2, '0')}</strong> sudah tercatat. Terima kasih sudah menjadi bagian dari cerita 56 tahun STM.</p><div className="success-logo"><LogoImage id={selection.id} eager /><span><Check size={15} /> PILIHANMU</span></div>{isDemo && <p className="demo-vote-note">Ini suara demo lokal dan belum tersimpan di Supabase.</p>}<button className="button button-primary w-full" onClick={closeSelection}>Kembali ke galeri <ArrowRight size={18} /></button></> : <><span className="eyebrow">{selection.stage === 'preview' ? 'KENALI PILIHANMU' : 'SATU LANGKAH LAGI'}</span><h3>{selection.stage === 'preview' ? `Logo ${String(selection.id).padStart(2, '0')}` : 'Sudah yakin memilih?'}</h3><p className="dialog-description">{selection.stage === 'preview' ? 'Kandidat logo HUT ke-56 STM – SMK Negeri 3 Gorontalo, 2026.' : <>Kamu akan memberikan satu suara untuk <strong>Logo {String(selection.id).padStart(2, '0')}</strong>.</>}</p><div className="modal-logo-art"><LogoImage id={selection.id} eager />{selection.stage === 'preview' && <a className="image-open-link" href={`/logo${selection.id}.webp`} target="_blank" rel="noreferrer" aria-label="Buka gambar logo dalam ukuran penuh"><ExternalLink size={16} /></a>}</div>{selection.stage === 'confirm' && <div className="confirm-notice"><Fingerprint size={19} /><span>Setelah dikonfirmasi, pilihanmu <strong>tidak dapat diubah</strong>. Satu browser hanya bisa memilih satu kali.</span></div>}{voteError && <div className="error-box" role="alert">{voteError}</div>}{status?.hasVoted ? <div className="preview-voted"><ShieldCheck size={18} /> Suaramu sudah tercatat untuk Logo {String(status.votedLogoId).padStart(2, '0')}.</div> : !status?.isOpen ? <div className="preview-voted"><LockKeyhole size={18} /> Voting sedang tidak tersedia.</div> : <button className="button button-primary w-full" disabled={voting} onClick={() => selection.stage === 'preview' ? setSelection({ ...selection, stage: 'confirm' }) : void confirmVote()}>{voting ? <><LoaderCircle size={18} className="spin" /> Mengirim suara...</> : selection.stage === 'preview' ? <>Pilih logo ini <ChevronRight size={18} /></> : <>Ya, pilih Logo {String(selection.id).padStart(2, '0')} <Check size={18} /></>}</button>}{selection.stage === 'confirm' && <button className="cancel-vote" onClick={closeSelection} disabled={voting}>Kembali, saya ingin lihat lagi</button>}</>}
    </Modal>}
  </>
}
