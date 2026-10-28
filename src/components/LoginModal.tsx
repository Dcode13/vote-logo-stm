import { useCallback, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'
import { isDemo, loginAdmin } from '../lib/api'
import type { AdminSession } from '../lib/types'
import Modal from './Modal'

export default function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (session: AdminSession) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = useCallback(onClose, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const session = await loginAdmin(username, password)
      onLogin(session)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal masuk. Silakan coba lagi.')
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Masuk dashboard admin" onClose={close} busy={busy} className="login-modal">
      <img className="login-school-logo" src="/school-logo.webp" alt="Logo SMK Negeri 3 Gorontalo" width="64" height="62" />
      <span className="eyebrow">RUANG PANITIA</span>
      <h3>Halo, Admin<span className="text-brand">.</span></h3>
      <p className="dialog-description">Masuk untuk melihat perolehan suara dan logo pilihan almamater kita.</p>
      <form onSubmit={submit} className="login-form">
        <label htmlFor="username">Username</label>
        <div className="input-wrap"><UserRound size={17} /><input id="username" name="username" autoComplete="username" placeholder="Masukkan username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={100} data-autofocus /></div>
        <label htmlFor="password">Kata sandi</label>
        <div className="input-wrap"><KeyRound size={17} /><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Masukkan kata sandi" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        {error && <div role="alert" className="error-box">{error}</div>}
        <button className="button button-primary w-full" disabled={busy} type="submit">{busy ? <><LoaderCircle className="spin" size={18} /> Memeriksa akun...</> : <>Masuk dashboard <ArrowRight size={18} /></>}</button>
      </form>
      <p className="login-note"><LockKeyhole size={13} /> Hasil voting hanya dapat diakses oleh admin.</p>
      {isDemo && <p className="demo-login">Mode demo · username <strong>admin123</strong> · sandi <strong>admin123</strong></p>}
    </Modal>
  )
}
