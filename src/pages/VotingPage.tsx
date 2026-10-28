import { useMemo, useState } from 'react'
import { ArrowDown, ArrowDownRight, ArrowRight, BadgeCheck, Check, CheckCheck, ChevronDown, Eye, Fingerprint, Heart, MoveUpRight, Search, ShieldCheck, Sparkles, Vote, X } from 'lucide-react'
import LogoImage from '../components/LogoImage'
import type { VotingStatus } from '../lib/types'

const ids = Array.from({ length: 14 }, (_, i) => i + 1)
const questions = [
  { question: 'Bagaimana cara memberikan suara?', answer: 'Lihat 14 kandidat logo, buka detail untuk melihat lebih dekat, lalu tekan “Vote logo ini”. Periksa kembali pilihanmu dan konfirmasi. Setelah berhasil, logo pilihanmu akan ditandai.' },
  { question: 'Berapa kali saya bisa memilih?', answer: 'Satu browser dapat memberikan satu suara. Pilihan yang sudah dikonfirmasi tidak dapat diubah. Gunakan browser yang sama untuk melihat status pilihanmu.' },
  { question: 'Siapa yang dapat melihat hasil voting?', answer: 'Hasil perolehan suara tersedia khusus untuk panitia melalui tautan dashboard terpisah dan memerlukan login admin.' },
]

export default function VotingPage({ status, onSelect, loading }: {
  status: VotingStatus | null; onSelect: (id: number, preview?: boolean) => void; loading: boolean
}) {
  const [query, setQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const visibleIds = useMemo(() => ids.filter((id) => `logo ${id} logo ${String(id).padStart(2, '0')} kandidat ${id}`.includes(query.trim().toLowerCase())), [query])

  return <>
    <section className="hero section-shell" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="edition-badge"><span className="status-dot" /> PERAYAAN HUT KE-56 <span className="badge-divider" /> 1970 — 2026</div>
        <h1 id="hero-title">56 tahun cerita.<br />Satu logo<br /><span className="hero-highlight">pilihan kita<svg viewBox="0 0 430 15" preserveAspectRatio="none" aria-hidden="true"><path d="M3 11 Q155 -3 423 6" /></svg>.</span></h1>
        <p className="hero-description">Dari kita, untuk almamater tercinta.<br className="desktop-break" /> Pilih logo yang akan menjadi wajah baru perayaan<br className="desktop-break" /> 56 tahun STM – SMK Negeri 3 Gorontalo.</p>
        <a href="#kandidat" className="button button-primary hero-cta">Pilih logo favoritmu <ArrowDownRight size={20} /></a>
        <div className="hero-footnote"><ShieldCheck size={15} /><span>Satu pilihan. Satu suara. Jadi bagian dari cerita.</span></div>
      </div>
      <div className="anniversary-art" aria-label="SMK Negeri 3 Gorontalo, merayakan 56 tahun berkarya">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="art-topline"><span>BERKARYA BERSAMA</span><MoveUpRight size={21} /></div>
        <div className="school-logo-halo"><img className="school-hero-logo" src="/school-logo.webp" alt="Lambang SMK Negeri 3 Gorontalo" width="300" height="293" fetchPriority="high" /></div>
        <span className="school-anniversary-chip"><Sparkles size={13} /> HUT KE-56 · 2026</span>
        <div className="art-bottom"><span>STM / SMKN 3<br /><strong>GORONTALO.</strong></span><span className="art-year">EST.<br /><strong>1970</strong></span></div>
        <div className="art-sticker"><Heart size={17} /><span>Bangga jadi<br /><strong>bagian ceritanya.</strong></span></div>
      </div>
    </section>

    <div className="stat-strip section-shell">
      <div className="stat-item"><strong>14<span> /</span></strong><span>Karya penuh makna</span></div>
      <div className="stat-item"><strong>56<span> /</span></strong><span>Tahun menginspirasi</span></div>
      <div className="stat-item"><strong>{loading ? '···' : status ? status.totalVotes.toLocaleString('id-ID') : '—'}<span> /</span></strong><span>Suara terkumpul</span></div>
      <div className="stat-status"><span className="live-pill"><span className={`status-dot ${status && !status.isOpen ? 'closed' : ''}`} />{!status ? 'Memuat status' : status.isOpen ? 'Voting dibuka' : 'Voting ditutup'}</span><span>Suaramu menentukan identitas kita.</span></div>
    </div>

    <section id="kandidat" className="gallery-section section-shell" aria-labelledby="gallery-title">
      <div className="section-heading">
        <div><div className="eyebrow"><span className="small-line" /> GALERI KANDIDAT</div><h2 id="gallery-title">Karya mereka.<br /><span className="text-muted">Identitas kita.</span><span className="heading-star">✳</span></h2></div>
        <div className="gallery-intro"><span className="outline-tag">14 LOGO · 1 PILIHAN</span><p>Setiap logo punya cerita.<br />Mana yang paling mewakili semangat kita?</p></div>
      </div>
      {status?.hasVoted && <div className="voted-banner" role="status"><span className="voted-banner-icon"><CheckCheck size={21} /></span><div><strong>Terima kasih, suaramu sudah tercatat!</strong><p>Kamu memilih Logo {String(status.votedLogoId).padStart(2, '0')}. Bersama, kita buat perayaan ini lebih berarti.</p></div><BadgeCheck size={25} /></div>}
      <div className="gallery-toolbar"><span>Menampilkan <strong>{visibleIds.length}</strong> kandidat logo</span><div className="search-field"><Search size={16} /><input aria-label="Cari nomor logo" placeholder="Cari nomor logo..." value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button onClick={() => setQuery('')} aria-label="Hapus pencarian"><X size={14} /></button>}</div></div>
      <div className="logo-grid">
        {visibleIds.map((id) => {
          const chosen = status?.votedLogoId === id
          return <article className={`logo-card ${chosen ? 'logo-card-chosen' : ''}`} key={id}>
            <div className={`logo-artboard artboard-${id % 4}`}>
              <span className="candidate-number">{String(id).padStart(2, '0')}</span>
              {chosen && <span className="chosen-tag"><Check size={12} /> PILIHANMU</span>}
              <button className="artboard-preview" onClick={() => onSelect(id, true)} aria-label={`Lihat detail Logo ${id}`}><LogoImage id={id} eager={id <= 4} /></button>
              <button className="preview-button" onClick={() => onSelect(id, true)} aria-label={`Perbesar Logo ${id}`}><Eye size={16} /></button>
            </div>
            <div className="logo-card-body"><div className="logo-card-title"><h3>Logo {String(id).padStart(2, '0')}</h3><span>HUT KE-56</span></div><p>STM – SMK Negeri 3 Gorontalo</p><button className={`vote-button ${chosen ? 'chosen' : ''}`} onClick={() => onSelect(id)} disabled={loading || !status || status.hasVoted || !status.isOpen}>{chosen ? <><CheckCheck size={16} /> Pilihan kamu</> : status?.hasVoted ? <>Kamu sudah memilih <Check size={16} /></> : status && !status.isOpen ? <>Voting ditutup <ShieldCheck size={16} /></> : <>Vote logo ini <ArrowRight size={16} /></>}</button></div>
          </article>
        })}
      </div>
      {visibleIds.length === 0 && <div className="empty-state"><Search size={30} /><h3>Logo belum ditemukan</h3><p>Coba nomor logo dari 1 sampai 14.</p><button className="text-button" onClick={() => setQuery('')}>Tampilkan semua logo <ArrowRight size={15} /></button></div>}
      <div className="gallery-note"><Fingerprint size={16} /><p>Setiap suara punya arti. Pilih dengan hati, karena pilihanmu tidak dapat diubah.</p></div>
    </section>

    <section id="panduan" className="guide-section section-shell" aria-labelledby="guide-title">
      <div className="guide-top"><div><span className="eyebrow"><span className="small-line" /> CARA BERPARTISIPASI</span><h2 id="guide-title">Sesimpel itu.<br /><span className="text-muted">Seberarti ini.</span></h2></div><p>Tiga langkah kecil untuk menjadi bagian<br className="desktop-break" /> dari perjalanan besar almamater kita.</p></div>
      <div className="steps-grid">
        <div className="step"><span className="step-number">01</span><span className="step-icon"><Eye size={23} /></span><h3>Kenali setiap karya</h3><p>Jelajahi 14 kandidat. Klik logo untuk melihat detail dan temukan yang paling kamu suka.</p></div>
        <div className="step"><span className="step-number">02</span><span className="step-icon"><Vote size={23} /></span><h3>Tentukan pilihanmu</h3><p>Pilih satu logo yang paling mencerminkan semangat dan kebanggaan almamater kita.</p></div>
        <div className="step"><span className="step-number">03</span><span className="step-icon"><BadgeCheck size={23} /></span><h3>Jadikan suaramu berarti</h3><p>Konfirmasi pilihanmu. Selesai! Suaramu ikut menentukan wajah perayaan ke-56 kita.</p></div>
      </div>
    </section>

    <section className="faq-section section-shell" aria-labelledby="faq-title"><div><span className="eyebrow">BIAR MAKIN YAKIN</span><h2 id="faq-title">Masih penasaran<span className="text-brand">?</span></h2><p>Beberapa hal yang perlu kamu tahu<br />sebelum memberikan suara.</p></div><div className="faq-list">{questions.map((item, i) => <div className={`faq-item ${openFaq === i ? 'faq-open' : ''}`} key={item.question}><button aria-expanded={openFaq === i} aria-controls={`faq-${i}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>{item.question}<ChevronDown size={18} /></button>{openFaq === i && <p id={`faq-${i}`}>{item.answer}</p>}</div>)}</div></section>

    <section className="closing-section section-shell"><Sparkles size={25} /><h2>Logo boleh berbeda.<br />Kebanggaan kita tetap sama.</h2><p>56 tahun STM. Terus berkarya, terus menginspirasi.</p><a href="#kandidat" className="button button-primary">Jadi bagian dari ceritanya <ArrowDown size={18} /></a><img className="closing-emblem" src="/school-logo.webp" alt="" aria-hidden="true" width="260" height="254" /></section>
  </>
}
