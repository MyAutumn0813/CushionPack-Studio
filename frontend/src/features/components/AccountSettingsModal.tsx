import { useEffect, useState, type ReactNode } from 'react'
import type { AccountSettings } from '../accountPreferences'
import DropdownSelect from './DropdownSelect'

type AccountSettingsSection = 'general' | 'account'

type AccountSettingsModalProps = {
  open: boolean
  settings: AccountSettings
  onClose: () => void
  onChange: (settings: AccountSettings) => void
}

const accentColorOptions: Array<{ value: AccountSettings['accentColor']; label: string }> = [
  { value: 'Blue', label: 'Blue' },
  { value: 'Green', label: 'Green' },
  { value: 'Amber', label: 'Yellow' },
  { value: 'Pink', label: 'Pink' },
  { value: 'Orange', label: 'Orange' },
  { value: 'Purple', label: 'Purple' },
]

const sectionItems: Array<{
  id: AccountSettingsSection
  label: string
  icon: ReactNode
}> = [
  {
    id: 'account',
    label: 'Account',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="3.3" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 1 1-3.6 0v-.2a1 1 0 0 0-.7-1 1 1 0 0 0-1 .2l-.2.1a1.8 1.8 0 0 1-2.4-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 1 1 0-3.6h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1l-.1-.2a1.8 1.8 0 0 1 2.5-2.4l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 1 1 3.6 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1-.2l.2-.1a1.8 1.8 0 0 1 2.4 2.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 1 1 0 3.6h-.2a1 1 0 0 0-1 .7z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function AccountSettingsModal({
  open,
  settings,
  onClose,
  onChange,
}: AccountSettingsModalProps) {
  const [activeSection, setActiveSection] = useState<AccountSettingsSection>('general')
  const [voiceMessage, setVoiceMessage] = useState('')

  useEffect(() => {
    if (!open) {
      setActiveSection('general')
      setVoiceMessage('')
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  const updateSettings = <Key extends keyof AccountSettings>(key: Key, value: AccountSettings[Key]) => {
    onChange({
      ...settings,
      [key]: value,
    })
  }

  const renderGeneralPanel = () => (
    <div className="account-settings-modal__panel">
      <div className="account-settings-modal__row">
        <div className="account-settings-modal__label-group">
          <div className="account-settings-modal__label">Appearance</div>
        </div>
        <DropdownSelect
          className="account-settings-modal__select"
          id="account-settings-appearance"
          value={settings.appearance}
          onChange={(event) => updateSettings('appearance', event.target.value as AccountSettings['appearance'])}
        >
          <option value="Light">Light</option>
          <option value="Dark">Dark</option>
        </DropdownSelect>
      </div>

      <div className="account-settings-modal__row">
        <div className="account-settings-modal__label-group">
          <div className="account-settings-modal__label">Accent color</div>
        </div>
        <label className="account-settings-modal__select-wrap">
          <span className={`account-settings-modal__accent-dot account-settings-modal__accent-dot--${settings.accentColor.toLowerCase()}`} />
          <DropdownSelect
            className="account-settings-modal__select"
            id="account-settings-accent-color"
            value={settings.accentColor}
            onChange={(event) => updateSettings('accentColor', event.target.value as AccountSettings['accentColor'])}
          >
            {accentColorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </DropdownSelect>
        </label>
      </div>

      <div className="account-settings-modal__row">
        <div className="account-settings-modal__label-group">
          <div className="account-settings-modal__label">Language</div>
        </div>
        <DropdownSelect
          className="account-settings-modal__select"
          id="account-settings-language"
          value={settings.language}
          onChange={(event) => updateSettings('language', event.target.value as AccountSettings['language'])}
        >
          <option value="English (US)">English (US)</option>
          <option value="Chinese (Simplified)">Chinese (Simplified)</option>
        </DropdownSelect>
      </div>

      <div className="account-settings-modal__row">
        <div className="account-settings-modal__label-group">
          <div className="account-settings-modal__label">Spoken language</div>
          <div className="account-settings-modal__description">
            For best results, select the language you mainly speak. This preference is stored locally for this browser.
          </div>
        </div>
        <DropdownSelect
          className="account-settings-modal__select"
          id="account-settings-spoken-language"
          value={settings.spokenLanguage}
          onChange={(event) => updateSettings('spokenLanguage', event.target.value as AccountSettings['spokenLanguage'])}
        >
          <option value="Chinese">Chinese</option>
          <option value="English">English</option>
        </DropdownSelect>
      </div>

      <div className="account-settings-modal__row">
        <div className="account-settings-modal__label-group">
          <div className="account-settings-modal__label">Voice</div>
        </div>
        <div className="account-settings-modal__voice-actions">
          <button
            type="button"
            className="account-settings-modal__play"
            onClick={() => setVoiceMessage('Voice preview is not configured in this build.')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 6.5v11l9-5.5-9-5.5z" />
            </svg>
            <span>Play</span>
          </button>
          <DropdownSelect
            className="account-settings-modal__select"
            id="account-settings-voice"
            value={settings.voice}
            onChange={(event) => updateSettings('voice', event.target.value as AccountSettings['voice'])}
          >
            <option value="Spruce">Spruce</option>
            <option value="Maple">Maple</option>
            <option value="Cedar">Cedar</option>
          </DropdownSelect>
        </div>
      </div>

      <div className="account-settings-modal__row">
        <div className="account-settings-modal__label-group">
          <div className="account-settings-modal__label">Separate voice</div>
          <div className="account-settings-modal__description">Keep voice controls separate from the main workspace layout.</div>
        </div>
        <button
          type="button"
          className={`account-settings-modal__switch ${settings.separateVoice ? 'is-on' : ''}`}
          aria-pressed={settings.separateVoice}
          onClick={() => updateSettings('separateVoice', !settings.separateVoice)}
        >
          <span className="account-settings-modal__switch-handle" />
        </button>
      </div>

      {voiceMessage ? <div className="account-settings-modal__status">{voiceMessage}</div> : null}
    </div>
  )

  const renderAccountPanel = () => (
    <div className="account-settings-modal__placeholder">
      <h3>Account settings are temporarily unavailable.</h3>
      <p>This section has been cleared for now and will be restored later.</p>
    </div>
  )

  const activeSectionLabel = sectionItems.find((item) => item.id === activeSection)?.label ?? 'Settings'

  return (
    <div className="account-modal-backdrop" onClick={onClose}>
      <section
        className="account-modal account-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="account-settings-modal__header">
          <button type="button" className="account-modal__close" aria-label="Close settings dialog" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 6l12 12" strokeLinecap="round" />
              <path d="M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          <h2 id="account-settings-modal-title" className="account-modal__title">
            {activeSectionLabel}
          </h2>
        </header>

        <div className="account-settings-modal__layout">
          <aside className="account-settings-modal__sidebar">
            {sectionItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`account-settings-modal__nav-item ${activeSection === item.id ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveSection(item.id)
                  setVoiceMessage('')
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </aside>

          <div className="account-settings-modal__content">
            {activeSection === 'general' ? renderGeneralPanel() : null}
            {activeSection === 'account' ? renderAccountPanel() : null}
          </div>
        </div>
      </section>
    </div>
  )
}
