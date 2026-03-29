export type FeaturePermissionKey = 'library' | 'newTask' | 'explore'
export type AuthUserRole = 'admin' | 'user'
export type AuthUserStatus = 'active' | 'disabled'
export type AuthUserAccessState = AuthUserStatus | 'expired'

export type FeaturePermissions = {
  library: boolean
  newTask: boolean
  explore: boolean
}

export type AuthUserPayload = {
  id?: string
  email?: string
  createdAt?: string
  updatedAt?: string
  displayName?: string
  username?: string
  phone?: string
  organization?: string
  expiresAt?: string
  role?: string
  status?: string
  accessState?: string
  permissions?: Partial<FeaturePermissions> | null
  passwordUpdatedAt?: string
}

export type AuthUser = {
  id: string
  email: string
  createdAt: string
  updatedAt: string
  displayName: string
  username: string
  phone: string
  organization: string
  expiresAt: string
  role: AuthUserRole
  status: AuthUserStatus
  accessState: AuthUserAccessState
  permissions: FeaturePermissions
  passwordUpdatedAt: string
}

export type StoredAuthSession = {
  token: string
  user: AuthUser
}

export type AuthResponse = {
  message?: string
  token?: string
  user?: AuthUserPayload
}

export const AUTH_STORAGE_KEY = 'cushionpack-auth-session'
export const AUTH_EXPIRED_EVENT = 'bp:auth-expired'

export const AUTH_PERMISSION_LABELS: Record<FeaturePermissionKey, string> = {
  library: 'Library',
  newTask: 'New task',
  explore: 'Explore',
}

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const capitalizeWord = (value: string) =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}` : value

const extractEmailLocalPart = (email: string) => String(email ?? '').trim().split('@')[0] ?? ''

export const deriveUsernameFromEmail = (email: string) => {
  const localPart = extractEmailLocalPart(email)
  const normalized = localPart.replace(/[^a-zA-Z0-9_.-]/g, '').trim()
  return normalized || 'user'
}

export const deriveDisplayNameFromEmail = (email: string) => {
  const localPart = extractEmailLocalPart(email)
  if (!localPart) {
    return 'CushionPack User'
  }

  const segments = localPart
    .replace(/[_-]+/g, ' ')
    .split('.')
    .join(' ')
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  if (segments.length < 1) {
    return localPart
  }

  const hasAlphabeticCharacters = segments.some((segment) => /[a-zA-Z]/.test(segment))
  if (!hasAlphabeticCharacters) {
    return localPart
  }

  return segments.map((segment) => capitalizeWord(segment)).join(' ')
}

export const createDefaultFeaturePermissions = (): FeaturePermissions => ({
  library: true,
  newTask: true,
  explore: true,
})

export const normalizeFeaturePermissions = (
  payload?: Partial<FeaturePermissions> | null,
  fallback: FeaturePermissions = createDefaultFeaturePermissions(),
): FeaturePermissions => ({
  library: payload?.library === undefined ? fallback.library : payload.library === true,
  newTask: payload?.newTask === undefined ? fallback.newTask : payload.newTask === true,
  explore: payload?.explore === undefined ? fallback.explore : payload.explore === true,
})

const normalizeAuthRole = (value?: string | null): AuthUserRole => (String(value ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'user')

const normalizeAuthStatus = (value?: string | null): AuthUserStatus =>
  String(value ?? '').trim().toLowerCase() === 'disabled' ? 'disabled' : 'active'

const normalizeAuthAccessState = (value?: string | null, status: AuthUserStatus = 'active'): AuthUserAccessState => {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'expired') {
    return 'expired'
  }
  if (normalized === 'disabled') {
    return 'disabled'
  }
  return status
}

const normalizeDateValue = (value?: string | null) => {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : ''
}

export const normalizeAuthUser = (payload?: AuthUserPayload | null): AuthUser | null => {
  const id = String(payload?.id ?? '').trim()
  const email = String(payload?.email ?? '').trim().toLowerCase()
  const createdAt = String(payload?.createdAt ?? '').trim()
  if (!id || !email || !createdAt) {
    return null
  }

  const role = normalizeAuthRole(payload?.role)
  const status = normalizeAuthStatus(payload?.status)

  return {
    id,
    email,
    createdAt,
    updatedAt: String(payload?.updatedAt ?? '').trim() || createdAt,
    displayName: String(payload?.displayName ?? '').trim() || deriveDisplayNameFromEmail(email),
    username: String(payload?.username ?? '').trim() || deriveUsernameFromEmail(email),
    phone: String(payload?.phone ?? '').trim(),
    organization: String(payload?.organization ?? '').trim(),
    expiresAt: normalizeDateValue(payload?.expiresAt),
    role,
    status,
    accessState: normalizeAuthAccessState(payload?.accessState, status),
    permissions: normalizeFeaturePermissions(payload?.permissions),
    passwordUpdatedAt: String(payload?.passwordUpdatedAt ?? '').trim(),
  }
}

export const hasFeatureAccess = (user: Pick<AuthUser, 'permissions'> | null | undefined, feature: FeaturePermissionKey) =>
  Boolean(user?.permissions?.[feature])

export const isAdminUser = (user: Pick<AuthUser, 'role'> | null | undefined) => user?.role === 'admin'

export const readStoredAuthSession = (): StoredAuthSession | null => {
  if (!canUseStorage()) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as {
      token?: string
      user?: AuthUserPayload
    }
    const token = String(parsed?.token ?? '').trim()
    const user = normalizeAuthUser(parsed?.user)
    if (!token || !user) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    return {
      token,
      user,
    }
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export const writeStoredAuthSession = (session: StoredAuthSession) => {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export const clearStoredAuthSession = () => {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export const getAuthToken = () => readStoredAuthSession()?.token ?? ''

export const emitAuthExpired = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
}
