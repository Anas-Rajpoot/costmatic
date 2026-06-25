import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

interface Props {
  onScan: (barcode: string) => void
  onClose: () => void
}

export default function CameraScanner({ onScan, onClose }: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let reader: import('@zxing/library').BrowserMultiFormatReader | null = null
    let active = true

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library')
        reader = new BrowserMultiFormatReader()

        if (!videoRef.current || !active) return

        await reader.decodeFromVideoDevice(
          null,
          videoRef.current,
          (result, err) => {
            if (result && active) {
              const text = result.getText().trim()
              if (text) {
                active = false
                reader?.reset()
                onScan(text)
                onClose()
              }
            }
            void err // suppress no-result errors
          }
        )
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Camera error')
      }
    }

    start()

    return () => {
      active = false
      reader?.reset()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-sm"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="font-semibold text-ink text-sm">{t('pos.cameraTitle')}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <div className="text-due text-sm text-center py-6">{error}</div>
          ) : (
            <div className="relative rounded-input overflow-hidden bg-black aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" />
              {/* Scan guide overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-24 border-2 border-brand rounded opacity-60" />
              </div>
            </div>
          )}
          <p className="text-xs text-ink-muted text-center mt-3">
            Point at a barcode — it will scan automatically
          </p>
        </div>
      </motion.div>
    </div>
  )
}
