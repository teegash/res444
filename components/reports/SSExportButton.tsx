'use client'

export function SSExportButton(props: { onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      className="ss-btn no-print"
      onClick={props.onClick}
      aria-label={props.ariaLabel ?? 'Export report'}
      title="Export"
    >
      ss
    </button>
  )
}
