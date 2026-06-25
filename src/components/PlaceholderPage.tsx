import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  titleKey: string
  icon: LucideIcon
  phase: number
  descriptionKey?: string
}

export default function PlaceholderPage({ titleKey, icon: Icon, phase, descriptionKey }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
      <div className="w-16 h-16 rounded-card bg-brand-soft flex items-center justify-center mb-4">
        <Icon size={28} className="text-brand" />
      </div>
      <h1 className="text-xl font-semibold text-ink mb-2">{t(titleKey)}</h1>
      {descriptionKey && (
        <p className="text-ink-muted text-sm mb-4 max-w-xs">{t(descriptionKey)}</p>
      )}
      <span className="text-xs text-ink-muted bg-line px-3 py-1 rounded-full">
        {t('common.phase')} {phase}
      </span>
    </div>
  )
}
