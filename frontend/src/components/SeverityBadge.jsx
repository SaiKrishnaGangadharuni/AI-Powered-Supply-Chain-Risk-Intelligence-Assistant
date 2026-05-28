import clsx from 'clsx'

const STYLES = {
  LOW:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-100  text-amber-700  border-amber-200',
  HIGH:   'bg-rose-100   text-rose-700   border-rose-200',
}

export default function SeverityBadge({ severity = 'LOW', className }) {
  const s = (severity || 'LOW').toUpperCase()
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
      STYLES[s] || STYLES.LOW,
      className,
    )}>
      {s}
    </span>
  )
}
