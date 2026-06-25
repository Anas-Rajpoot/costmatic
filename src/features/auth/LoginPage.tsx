import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function LoginPage() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await signIn(email, password)
    setLoading(false)

    if (result.error) {
      if (result.error === 'account_inactive') {
        setError(t('auth.accountInactive'))
      } else {
        setError(t('auth.invalidCredentials'))
      }
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl font-semibold text-accent tracking-wide">Costmatic</span>
          <p className="text-ink-muted text-sm mt-1">Wholesale Shop Manager</p>
        </div>

        <div className="bg-surface rounded-card border border-line p-8 shadow-sm">
          <h1 className="text-base font-semibold text-ink mb-6">{t('auth.loginHeading')}</h1>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-input bg-due-soft border border-due/20 text-due text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">
                {t('auth.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@shop.com"
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-ink-muted mb-1.5">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-brand hover:bg-brand-dark disabled:opacity-60 text-white rounded-btn font-semibold text-sm transition-colors duration-150 active:scale-[0.98]"
            >
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
