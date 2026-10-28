const originals = [
  'WhatsApp Image 2026-10-28 at 20.47.52.jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.53 (1).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.53 (2).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.53.jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.54 (1).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.54 (2).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.54 (3).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.54.jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.55 (1).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.55 (2).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.55.jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.56 (1).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.56 (2).jpeg',
  'WhatsApp Image 2026-10-28 at 20.47.56.jpeg',
]

export default function LogoImage({ id, className = '', eager = false }: { id: number; className?: string; eager?: boolean }) {
  return <img
    className={className}
    src={`/logo${id}.webp`}
    alt={`Logo kandidat ${String(id).padStart(2, '0')} HUT ke-56 STM SMK Negeri 3 Gorontalo`}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
    onError={(event) => {
      const original = originals[id - 1]
      if (original && !event.currentTarget.dataset.fallback) {
        event.currentTarget.dataset.fallback = 'true'
        event.currentTarget.src = `/${encodeURIComponent(original)}`
      }
    }}
  />
}
