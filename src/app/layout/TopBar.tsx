import { useTranslation } from 'react-i18next'
import { Globe, LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import SyncIndicator from '@/components/SyncIndicator'

interface Props {
  showMenu: boolean
  onMenuClick: () => void
}

export default function TopBar({ showMenu, onMenuClick }: Props) {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  function toggleLanguage() {
    const next = i18n.language === 'en' ? 'ur' : 'en'
    i18n.changeLanguage(next)
    document.documentElement.dir = next === 'ur' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
    localStorage.setItem('lang', next)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="h-16 bg-brand-dark border-b border-white/10 flex items-center justify-between px-4 shrink-0">
      {/* Left: hamburger on mobile/tablet, empty on desktop */}
      {showMenu ? (
        <button
          onClick={onMenuClick}
          className="text-white/70 hover:text-white p-2 rounded-btn transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      ) : (
        <div />
      )}

      {/* Right: sync + lang + user */}
      <div className="flex items-center gap-4">
        <SyncIndicator />

        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors duration-150"
          title="Toggle language"
        >
          <Globe size={15} />
          {t('lang.toggle')}
        </button>

        {profile && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center text-white font-semibold text-xs select-none">
                {(profile.full_name || profile.email).charAt(0).toUpperCase()}
              </div>
              <span className="max-w-[120px] truncate hidden sm:block">
                {profile.full_name || profile.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              title={t('auth.signOut')}
              className="text-white/50 hover:text-white transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
