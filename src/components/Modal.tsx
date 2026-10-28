import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Modal({ title, children, onClose, className = '', busy = false }: {
  title: string; children: ReactNode; onClose: () => void; className?: string; busy?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
    ) ?? [])
    const initialFocus = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0] ?? ref.current
    initialFocus?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (!first) { event.preventDefault(); ref.current?.focus(); return }
        if (!ref.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); return }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = oldOverflow
      document.removeEventListener('keydown', handleKey)
      previous?.focus({ preventScroll: true })
    }
  }, [onClose, busy])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className={`modal ${className}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId} className="sr-only">{title}</h2>
        <button className="icon-button modal-close" aria-label="Tutup dialog" onClick={onClose} disabled={busy}><X size={20} /></button>
        {children}
      </div>
    </div>, document.body,
  )
}
