import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { AccountProfile } from '../accountPreferences'

type AccountProfileModalProps = {
  open: boolean
  email: string
  profile: AccountProfile
  onClose: () => void
  onSave: (profile: AccountProfile) => void
}

const getInitials = (displayName: string, username: string, email: string) => {
  const source = String(displayName || username || email).trim()
  if (!source) {
    return 'CP'
  }

  const words = source.split(/\s+/).filter((word) => word.length > 0)
  if (words.length > 1) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
  }

  return source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'CP'
}

export default function AccountProfileModal({
  open,
  email,
  profile,
  onClose,
  onSave,
}: AccountProfileModalProps) {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarDataUrl, setAvatarDataUrl] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const initials = useMemo(() => getInitials(displayName, username, email), [displayName, username, email])

  useEffect(() => {
    if (!open) {
      setDisplayName('')
      setUsername('')
      setAvatarDataUrl('')
      setError('')
      return
    }

    setDisplayName(profile.displayName)
    setUsername(profile.username)
    setAvatarDataUrl(profile.avatarDataUrl)
    setError('')

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [email, onClose, open, profile])

  if (!open) {
    return null
  }

  const handleSubmit = () => {
    setError('')
    onSave({
      displayName: displayName.trim() || profile.displayName,
      username: username.trim() || profile.username,
      avatarDataUrl: avatarDataUrl.trim(),
    })
    onClose()
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      setAvatarDataUrl(result)
      setError('')
    }
    reader.onerror = () => {
      setError('Failed to read image file.')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className="account-modal-backdrop" onClick={onClose}>
      <section
        className="account-modal account-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-profile-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="account-modal__header account-profile-modal__header">
          <h2 id="account-profile-modal-title" className="account-modal__title">
            Edit profile
          </h2>
        </header>

        <div className="account-profile-modal__hero">
          <div className="account-profile-modal__avatar-stack">
            {avatarDataUrl ? (
              <img className="account-profile-modal__avatar-image" src={avatarDataUrl} alt="Profile avatar" />
            ) : (
              <div className="account-profile-modal__avatar-fallback" aria-hidden="true">
                {initials}
              </div>
            )}
            <button
              type="button"
              className="account-profile-modal__avatar-action"
              aria-label="Upload profile image"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M4 8h3l1.8-2h6.4L17 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.2" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              className="account-profile-modal__file-input"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="account-profile-modal__hero-copy">
            <div className="account-profile-modal__hero-name">{displayName || 'Display name'}</div>
            <div className="account-profile-modal__hero-email">{email}</div>
          </div>
        </div>

        <div className="account-modal__body">
          <label className="account-modal__field">
            <span className="account-modal__label">Display name</span>
            <input
              className="account-modal__input"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          <label className="account-modal__field">
            <span className="account-modal__label">Username</span>
            <input
              className="account-modal__input"
              type="text"
              value={username}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <p className="account-profile-modal__hint">
            Display name, username, and avatar are saved locally on this device for this account.
          </p>

          {error ? <div className="account-modal__error">{error}</div> : null}
        </div>

        <footer className="account-modal__actions">
          <button type="button" className="account-modal__button account-modal__button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="account-modal__button account-modal__button--primary" onClick={handleSubmit}>
            Save
          </button>
        </footer>
      </section>
    </div>
  )
}
