export default function Brand({ small = false }: { small?: boolean }) {
  return (
    <a className={`brand ${small ? 'brand-small' : ''}`} href="#" aria-label="SMK Negeri 3 Gorontalo — kembali ke halaman voting">
      <img className="brand-mark" src="/school-logo.webp" alt="Logo SMK Negeri 3 Gorontalo" width="60" height="60" />
      <span className="brand-name">STM<span>SMK NEGERI 3 GORONTALO</span></span>
    </a>
  )
}
