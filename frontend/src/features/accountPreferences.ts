import type { AuthUser } from './auth'

export type AppearanceMode = 'Light' | 'Dark'
export type AccentColor = 'Blue' | 'Green' | 'Amber' | 'Pink' | 'Orange' | 'Purple'
export type InterfaceLanguage = 'English (US)' | 'Chinese (Simplified)'
export type SpokenLanguage = 'Chinese' | 'English'
export type VoiceName = 'Spruce' | 'Maple' | 'Cedar'

export type AccountProfile = {
  displayName: string
  username: string
  avatarDataUrl: string
}

export type AccountSettings = {
  appearance: AppearanceMode
  accentColor: AccentColor
  language: InterfaceLanguage
  spokenLanguage: SpokenLanguage
  voice: VoiceName
  separateVoice: boolean
}

export type AccountPreferences = {
  profile: AccountProfile
  settings: AccountSettings
}

const ACCOUNT_PREFERENCES_STORAGE_PREFIX = 'cushionpack-account-preferences'

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export const getAccountPreferenceStorageKey = (userId: string) =>
  `${ACCOUNT_PREFERENCES_STORAGE_PREFIX}:${String(userId ?? '').trim()}`

export const buildDefaultAccountProfile = (user: AuthUser): AccountProfile => ({
  displayName: user.displayName,
  username: user.username,
  avatarDataUrl: '',
})

export const buildDefaultAccountSettings = (): AccountSettings => ({
  appearance: 'Light',
  accentColor: 'Green',
  language: 'English (US)',
  spokenLanguage: 'Chinese',
  voice: 'Spruce',
  separateVoice: false,
})

const normalizeProfileText = (value: string | null | undefined, fallback: string) => {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

const normalizeAccountProfile = (value: Partial<AccountProfile> | null | undefined, user: AuthUser): AccountProfile => {
  const defaults = buildDefaultAccountProfile(user)
  const avatarDataUrl = String(value?.avatarDataUrl ?? '').trim()

  return {
    displayName: normalizeProfileText(value?.displayName, defaults.displayName),
    username: normalizeProfileText(value?.username, defaults.username),
    avatarDataUrl,
  }
}

const normalizeAccountSettings = (value: Partial<AccountSettings> | null | undefined): AccountSettings => {
  const defaults = buildDefaultAccountSettings()
  const appearance = value?.appearance === 'Dark' ? 'Dark' : defaults.appearance
  const accentColor =
    value?.accentColor === 'Blue' ||
    value?.accentColor === 'Green' ||
    value?.accentColor === 'Amber' ||
    value?.accentColor === 'Pink' ||
    value?.accentColor === 'Orange' ||
    value?.accentColor === 'Purple'
      ? value.accentColor
      : defaults.accentColor
  const language = value?.language === 'Chinese (Simplified)' ? value.language : defaults.language
  const spokenLanguage = value?.spokenLanguage === 'English' ? value.spokenLanguage : defaults.spokenLanguage
  const voice = value?.voice === 'Maple' || value?.voice === 'Cedar' ? value.voice : defaults.voice

  return {
    appearance,
    accentColor,
    language,
    spokenLanguage,
    voice,
    separateVoice: value?.separateVoice === true,
  }
}

export const readAccountPreferences = (user: AuthUser): AccountPreferences => {
  const defaults: AccountPreferences = {
    profile: buildDefaultAccountProfile(user),
    settings: buildDefaultAccountSettings(),
  }

  if (!canUseStorage()) {
    return defaults
  }

  try {
    const rawValue = window.localStorage.getItem(getAccountPreferenceStorageKey(user.id))
    if (!rawValue) {
      return defaults
    }

    const parsed = JSON.parse(rawValue) as {
      profile?: Partial<AccountProfile>
      settings?: Partial<AccountSettings>
    }

    return {
      profile: normalizeAccountProfile(parsed?.profile, user),
      settings: normalizeAccountSettings(parsed?.settings),
    }
  } catch {
    window.localStorage.removeItem(getAccountPreferenceStorageKey(user.id))
    return defaults
  }
}

export const writeAccountPreferences = (user: AuthUser, preferences: AccountPreferences) => {
  if (!canUseStorage()) {
    return
  }

  const payload: AccountPreferences = {
    profile: normalizeAccountProfile(preferences.profile, user),
    settings: normalizeAccountSettings(preferences.settings),
  }

  window.localStorage.setItem(getAccountPreferenceStorageKey(user.id), JSON.stringify(payload))
}
