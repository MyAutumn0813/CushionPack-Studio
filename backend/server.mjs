import cors from 'cors'
import express from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, promises as fsPromises, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PORT = Number(process.env.PORT ?? 8787)
const DATABASE_ROOT = path.join(__dirname, 'database')
const AUTH_USERS_FILE_PATH = path.join(DATABASE_ROOT, 'users.json')
const AUTH_SESSIONS_FILE_PATH = path.join(DATABASE_ROOT, 'sessions.json')
const AUTH_MIN_PASSWORD_LENGTH = 8
const AUTH_SCRYPT_KEY_LENGTH = 64
const AUTH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const AUTH_TOKEN_BYTES = 48
const AUTH_ROLE_ADMIN = 'admin'
const AUTH_ROLE_USER = 'user'
const AUTH_STATUS_ACTIVE = 'active'
const AUTH_STATUS_DISABLED = 'disabled'
const AUTH_PERMISSION_LIBRARY = 'library'
const AUTH_PERMISSION_NEW_TASK = 'newTask'
const AUTH_PERMISSION_EXPLORE = 'explore'
const AUTH_PERMISSION_KEYS = [AUTH_PERMISSION_LIBRARY, AUTH_PERMISSION_NEW_TASK, AUTH_PERMISSION_EXPLORE]
const DEFAULT_AUTH_PERMISSIONS = Object.freeze({
  [AUTH_PERMISSION_LIBRARY]: true,
  [AUTH_PERMISSION_NEW_TASK]: true,
  [AUTH_PERMISSION_EXPLORE]: true,
})
const AUTH_FEATURE_LABELS = Object.freeze({
  [AUTH_PERMISSION_LIBRARY]: 'Library',
  [AUTH_PERMISSION_NEW_TASK]: 'New task',
  [AUTH_PERMISSION_EXPLORE]: 'Explore',
})
const NEW_TASK_OUTPUT_ROOT = path.join(__dirname, 'data', 'New task')
const NEW_TASK_FILE_EXTENSION = '.xlsx'
const NEW_TASK_HEADERS = [
  'ID',
  'Drop_height',
  'TV_length',
  'TV_width',
  'TV_height',
  'Liner_category',
  'Liner_density',
  'Liner_thickness',
  'Product_fragility',
]
const NEW_TASK_PREDICTED_RESULTS_SUFFIX = '_predicted results'
const NEW_TASK_SUMMARY_SUFFIX = '_task-summary.json'
const PROJECT_META_FILE_NAME = '.project-meta.json'
const PROJECT_NOTE_MAX_LENGTH = 2000
const SHAP_FEATURE_DISPLAY_NAME_MAP = Object.freeze({
  TV_length: 'Product_length',
  TV_width: 'Product_width',
  TV_height: 'Product_height',
})
const MULTIPLE_TASK_UPLOAD_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls'])
const MULTIPLE_TASK_TEMPLATE_FILE_NAME = 'Multiple tasks template.xlsx'
const MULTIPLE_TASK_TEMPLATE_PATH = path.join(__dirname, 'data', 'Template', MULTIPLE_TASK_TEMPLATE_FILE_NAME)
const UNVERSIONED_MODEL_LABEL = 'Unversioned'
const DEPLOYMENT_META_FILE = '.model-deployment.json'
const VALIDATION_ACCURACY_FILE_NAME = 'Validation_accuracy.xlsx'
const BEST_HYPERPARAMETER_FILE_NAME = 'Best_hyperparamter.xlsx'
const MODEL_FILE_EXTENSION = '.rds'
const VALIDATION_FILE_EXTENSION = '.xlsx'
const LEGACY_MODEL_FILE_BASENAME = 'Ml_results'
const FINAL_MODEL_FILE_BASENAME = 'Final model'
const ALL_MODEL_FILE_BASENAME = 'All models'
const LEGACY_ALL_MODEL_FILE_BASENAME = 'All model'
const LEGACY_TRAIN_MODEL_FILE_BASENAME = 'Train model'
const DATA_TRAIN_FILE_BASENAME = 'Data train'
const LEGACY_DATA_TRAIN_FILE_BASENAME = 'data_train'
const DATA_TEST_FILE_BASENAME = 'Data test'
const LEGACY_DATA_TEST_FILE_BASENAME = 'data_test'
const ALL_MODEL_FILE_BASENAME_ALIASES = [
  ALL_MODEL_FILE_BASENAME,
  LEGACY_ALL_MODEL_FILE_BASENAME,
  LEGACY_TRAIN_MODEL_FILE_BASENAME,
]
const DATA_TRAIN_FILE_BASENAME_ALIASES = [DATA_TRAIN_FILE_BASENAME, LEGACY_DATA_TRAIN_FILE_BASENAME]
const DATA_TEST_FILE_BASENAME_ALIASES = [DATA_TEST_FILE_BASENAME, LEGACY_DATA_TEST_FILE_BASENAME]
const ALLOWED_DATA_FILE_EXTENSIONS = new Set(['.csv', '.tsv', '.xlsx', '.xls'])
const R_PLUMBER_HOST = String(process.env.R_PLUMBER_HOST ?? '127.0.0.1').trim() || '127.0.0.1'
const R_PLUMBER_PORT = Number(process.env.R_PLUMBER_PORT ?? 8791)
const R_PLUMBER_BASE_URL = `http://${R_PLUMBER_HOST}:${R_PLUMBER_PORT}`
const R_PLUMBER_HEALTH_TIMEOUT_MS = Number(process.env.R_PLUMBER_HEALTH_TIMEOUT_MS ?? 15000)
const R_PLUMBER_RUNNER_PATH = path.join(__dirname, 'r-api', 'run-library-api.R')
const R_PLUMBER_API_PATH = path.join(__dirname, 'r-api', 'library-api.R')
const R_PLUMBER_EXTERNAL = String(process.env.R_PLUMBER_EXTERNAL ?? '').trim() === '1'
const R_PLUMBER_SOURCE_PATHS = [R_PLUMBER_RUNNER_PATH, R_PLUMBER_API_PATH]

let rPlumberProcess = null
let rPlumberStartupPromise = null
let rPlumberSourceSignature = ''

const formatDateTime = (date) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const normalizeName = (value) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')

const sanitizeFileName = (value) => value.replace(/[\\/:*?"<>|]+/g, '_').trim()
const hasExtension = (fileName, extension) => path.extname(fileName).toLowerCase() === extension

const ensureValidName = (rawValue, fieldName) => {
  const normalized = normalizeName(String(rawValue ?? ''))
  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error(`${fieldName} is invalid.`)
  }
  return normalized
}

const ensureValidFileName = (rawValue) => {
  const fileName = sanitizeFileName(String(rawValue ?? ''))
  if (!fileName || fileName === '.' || fileName === '..') {
    throw new Error('fileName is invalid.')
  }
  if (fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('fileName is invalid.')
  }
  return fileName
}

const getDropHeightByProductMass = (productMass) => {
  if (productMass < 10) {
    return 800
  }
  if (productMass < 20) {
    return 600
  }
  if (productMass < 30) {
    return 500
  }
  if (productMass < 40) {
    return 400
  }
  if (productMass < 50) {
    return 300
  }
  if (productMass < 100) {
    return 200
  }
  return 100
}

const buildDeployedModelFileName = (productName, modelVersion) =>
  sanitizeFileName(`${productName}_${modelVersion}_${FINAL_MODEL_FILE_BASENAME}${MODEL_FILE_EXTENSION}`)

const buildAllModelFileName = (productName, modelVersion) =>
  sanitizeFileName(`${productName}_${modelVersion}_${ALL_MODEL_FILE_BASENAME}${MODEL_FILE_EXTENSION}`)

const getNamedModelFileRank = (fileName, baseNames) => {
  const normalizedFileName = String(fileName ?? '').trim().toLowerCase()
  return baseNames.findIndex((baseName) =>
    normalizedFileName.endsWith(`_${String(baseName ?? '').trim().toLowerCase()}${MODEL_FILE_EXTENSION}`),
  )
}

const isAllModelFile = (fileName) => getNamedModelFileRank(fileName, ALL_MODEL_FILE_BASENAME_ALIASES) !== -1

const isFinalModelFile = (fileName) =>
  String(fileName ?? '')
    .trim()
    .toLowerCase()
    .endsWith(`_${FINAL_MODEL_FILE_BASENAME.toLowerCase()}${MODEL_FILE_EXTENSION}`)

const isLegacyModelFile = (fileName) =>
  String(fileName ?? '')
    .trim()
    .toLowerCase()
    .endsWith(`_${LEGACY_MODEL_FILE_BASENAME.toLowerCase()}${MODEL_FILE_EXTENSION}`)

const isDeployableModelFile = (fileName) =>
  hasExtension(String(fileName ?? '').trim(), MODEL_FILE_EXTENSION)

const getDeployableModelFileRank = (fileName) => {
  const allModelRank = getNamedModelFileRank(fileName, ALL_MODEL_FILE_BASENAME_ALIASES)
  if (allModelRank !== -1) {
    return allModelRank
  }
  if (isFinalModelFile(fileName)) {
    return 10
  }
  if (isLegacyModelFile(fileName)) {
    return 20
  }
  return 30
}

const getFileExtension = (fileName) => {
  const extension = path.extname(String(fileName ?? '').trim()).toLowerCase()
  return extension && extension !== '.' ? extension : ''
}

const buildVersionAttachmentFileName = (namePrefix, modelVersion, baseName, originalName) =>
  sanitizeFileName(`${namePrefix}_${modelVersion}_${baseName}${getFileExtension(originalName)}`)

const buildVersionDirectoryPath = (productPath, modelVersion) =>
  modelVersion === UNVERSIONED_MODEL_LABEL ? productPath : path.join(productPath, modelVersion)

const sortDeployableModelFiles = (fileNames) =>
  [...fileNames].sort((left, right) => {
    const rankDiff = getDeployableModelFileRank(left) - getDeployableModelFileRank(right)
    return rankDiff !== 0 ? rankDiff : left.localeCompare(right)
  })

const ensureDir = async (targetPath) => {
  await fsPromises.mkdir(targetPath, { recursive: true })
}

const pathExists = async (targetPath) => {
  try {
    await fsPromises.access(targetPath)
    return true
  } catch {
    return false
  }
}

const ensureValidEmail = (rawValue) => {
  const email = String(rawValue ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email is invalid.')
  }
  return email
}

const ensureValidPassword = (rawValue) => {
  const password = String(rawValue ?? '')
  if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters.`)
  }
  return password
}

const capitalizeWord = (value) =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}` : value

const extractEmailLocalPart = (email) => String(email ?? '').trim().split('@')[0] ?? ''

const deriveUsernameFromEmail = (email) => {
  const localPart = extractEmailLocalPart(email)
  const normalized = localPart.replace(/[^a-zA-Z0-9_.-]/g, '').trim()
  return normalized || 'user'
}

const deriveDisplayNameFromEmail = (email) => {
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

const normalizeDisplayName = (rawValue, fallbackEmail = '') => {
  const normalized = String(rawValue ?? '').trim().replace(/\s+/g, ' ').slice(0, 64)
  return normalized || deriveDisplayNameFromEmail(fallbackEmail)
}

const normalizeUsername = (rawValue, fallbackEmail = '') => {
  const normalized = String(rawValue ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 32)

  if (normalized.length >= 3) {
    return normalized
  }

  const fallback = deriveUsernameFromEmail(fallbackEmail).slice(0, 32)
  return fallback.length >= 3 ? fallback : 'user'
}

const normalizeOptionalPhone = (rawValue) => String(rawValue ?? '').trim().slice(0, 32)
const normalizeOptionalOrganization = (rawValue) => String(rawValue ?? '').trim().replace(/\s+/g, ' ').slice(0, 64)

const normalizeOptionalDateValue = (rawValue) => {
  const value = String(rawValue ?? '').trim()
  if (!value) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    return value
  }

  const parsedTime = Date.parse(value)
  return Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString().slice(0, 10) : ''
}

const normalizeAuthRole = (rawValue, fallbackRole = AUTH_ROLE_USER) => {
  const role = String(rawValue ?? '').trim().toLowerCase()
  return role === AUTH_ROLE_ADMIN || role === AUTH_ROLE_USER ? role : fallbackRole
}

const normalizeAuthStatus = (rawValue, fallbackStatus = AUTH_STATUS_ACTIVE) => {
  const status = String(rawValue ?? '').trim().toLowerCase()
  return status === AUTH_STATUS_ACTIVE || status === AUTH_STATUS_DISABLED ? status : fallbackStatus
}

const createDefaultAuthPermissions = () => ({
  [AUTH_PERMISSION_LIBRARY]: DEFAULT_AUTH_PERMISSIONS[AUTH_PERMISSION_LIBRARY],
  [AUTH_PERMISSION_NEW_TASK]: DEFAULT_AUTH_PERMISSIONS[AUTH_PERMISSION_NEW_TASK],
  [AUTH_PERMISSION_EXPLORE]: DEFAULT_AUTH_PERMISSIONS[AUTH_PERMISSION_EXPLORE],
})

const normalizeAuthPermissions = (rawValue, fallbackPermissions = DEFAULT_AUTH_PERMISSIONS) => {
  const fallback =
    fallbackPermissions && typeof fallbackPermissions === 'object' ? fallbackPermissions : DEFAULT_AUTH_PERMISSIONS

  return {
    [AUTH_PERMISSION_LIBRARY]:
      rawValue?.[AUTH_PERMISSION_LIBRARY] === undefined
        ? fallback[AUTH_PERMISSION_LIBRARY] === true
        : rawValue[AUTH_PERMISSION_LIBRARY] === true,
    [AUTH_PERMISSION_NEW_TASK]:
      rawValue?.[AUTH_PERMISSION_NEW_TASK] === undefined
        ? fallback[AUTH_PERMISSION_NEW_TASK] === true
        : rawValue[AUTH_PERMISSION_NEW_TASK] === true,
    [AUTH_PERMISSION_EXPLORE]:
      rawValue?.[AUTH_PERMISSION_EXPLORE] === undefined
        ? fallback[AUTH_PERMISSION_EXPLORE] === true
        : rawValue[AUTH_PERMISSION_EXPLORE] === true,
  }
}

const readJsonArrayFile = async (filePath) => {
  await ensureDir(path.dirname(filePath))
  if (!(await pathExists(filePath))) {
    await fsPromises.writeFile(filePath, '[]\n', 'utf8')
    return []
  }

  const rawContent = await fsPromises.readFile(filePath, 'utf8')
  if (!rawContent.trim()) {
    return []
  }

  let payload
  try {
    payload = JSON.parse(rawContent)
  } catch {
    throw new Error(`Failed to parse ${path.basename(filePath)}.`)
  }

  if (!Array.isArray(payload)) {
    throw new Error(`${path.basename(filePath)} is invalid.`)
  }

  return payload
}

const writeJsonArrayFile = async (filePath, payload) => {
  await ensureDir(path.dirname(filePath))
  await fsPromises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

const getAuthUserAccessState = (user) => {
  if (String(user?.status ?? '').trim().toLowerCase() === AUTH_STATUS_DISABLED) {
    return AUTH_STATUS_DISABLED
  }

  const expiresAt = normalizeOptionalDateValue(user?.expiresAt)
  if (expiresAt && Date.now() > Date.parse(`${expiresAt}T23:59:59.999Z`)) {
    return 'expired'
  }

  return AUTH_STATUS_ACTIVE
}

const sanitizeAuthUser = (user) => ({
  id: String(user?.id ?? '').trim(),
  email: String(user?.email ?? '').trim().toLowerCase(),
  createdAt: String(user?.createdAt ?? '').trim(),
  updatedAt: String(user?.updatedAt ?? '').trim(),
  displayName: normalizeDisplayName(user?.displayName, user?.email),
  username: normalizeUsername(user?.username, user?.email),
  phone: normalizeOptionalPhone(user?.phone),
  organization: normalizeOptionalOrganization(user?.organization),
  expiresAt: normalizeOptionalDateValue(user?.expiresAt),
  role: normalizeAuthRole(user?.role, AUTH_ROLE_USER),
  status: normalizeAuthStatus(user?.status, AUTH_STATUS_ACTIVE),
  accessState: getAuthUserAccessState(user),
  permissions: normalizeAuthPermissions(user?.permissions),
  passwordUpdatedAt: String(user?.passwordUpdatedAt ?? '').trim(),
})

const readAuthUsers = async () => {
  const rawUsers = await readJsonArrayFile(AUTH_USERS_FILE_PATH)
  const hasExplicitAdmin = rawUsers.some((user) => String(user?.role ?? '').trim().toLowerCase() === AUTH_ROLE_ADMIN)
  let shouldRewrite = false

  const normalizedUsers = rawUsers
    .map((user, index) => {
      const id = String(user?.id ?? '').trim()
      const email = String(user?.email ?? '').trim().toLowerCase()
      const passwordHash = String(user?.passwordHash ?? '').trim()
      const createdAt = String(user?.createdAt ?? '').trim()
      if (!id || !email || !passwordHash || !createdAt) {
        shouldRewrite = true
        return null
      }

      const defaultRole = !hasExplicitAdmin && index === 0 ? AUTH_ROLE_ADMIN : AUTH_ROLE_USER
      const updatedAt = String(user?.updatedAt ?? '').trim() || createdAt
      const displayName = normalizeDisplayName(user?.displayName, email)
      const username = normalizeUsername(user?.username, email)
      const phone = normalizeOptionalPhone(user?.phone)
      const organization = normalizeOptionalOrganization(user?.organization)
      const expiresAt = normalizeOptionalDateValue(user?.expiresAt)
      const role = normalizeAuthRole(user?.role, defaultRole)
      const status = normalizeAuthStatus(user?.status, AUTH_STATUS_ACTIVE)
      const permissions = normalizeAuthPermissions(user?.permissions)
      const passwordUpdatedAt = String(user?.passwordUpdatedAt ?? '').trim() || createdAt

      if (
        updatedAt !== String(user?.updatedAt ?? '').trim() ||
        displayName !== String(user?.displayName ?? '').trim() ||
        username !== String(user?.username ?? '').trim() ||
        phone !== String(user?.phone ?? '').trim() ||
        organization !== String(user?.organization ?? '').trim() ||
        expiresAt !== normalizeOptionalDateValue(String(user?.expiresAt ?? '').trim()) ||
        role !== String(user?.role ?? '').trim().toLowerCase() ||
        status !== String(user?.status ?? '').trim().toLowerCase() ||
        passwordUpdatedAt !== String(user?.passwordUpdatedAt ?? '').trim() ||
        AUTH_PERMISSION_KEYS.some((key) => user?.permissions?.[key] !== permissions[key])
      ) {
        shouldRewrite = true
      }

      return {
        id,
        email,
        passwordHash,
        createdAt,
        updatedAt,
        displayName,
        username,
        phone,
        organization,
        expiresAt,
        role,
        status,
        permissions,
        passwordUpdatedAt,
      }
    })
    .filter((user) => user !== null)

  if (normalizedUsers.length !== rawUsers.length || shouldRewrite) {
    await writeJsonArrayFile(AUTH_USERS_FILE_PATH, normalizedUsers)
  }

  return normalizedUsers
}

const readAuthSessions = async () => {
  const sessions = await readJsonArrayFile(AUTH_SESSIONS_FILE_PATH)
  const now = Date.now()
  const normalizedSessions = sessions
    .map((session) => {
      const token = String(session?.token ?? '').trim()
      const userId = String(session?.userId ?? '').trim()
      const createdAt = String(session?.createdAt ?? '').trim()
      const expiresAt = String(session?.expiresAt ?? '').trim()
      const expiresAtTime = Date.parse(expiresAt)
      if (!token || !userId || !createdAt || !expiresAt || !Number.isFinite(expiresAtTime) || expiresAtTime <= now) {
        return null
      }

      return {
        token,
        userId,
        createdAt,
        expiresAt,
      }
    })
    .filter((session) => session !== null)

  if (normalizedSessions.length !== sessions.length) {
    await writeJsonArrayFile(AUTH_SESSIONS_FILE_PATH, normalizedSessions)
  }

  return normalizedSessions
}

const createPasswordHash = (password) => {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, AUTH_SCRYPT_KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

const verifyPasswordHash = (password, storedPasswordHash) => {
  const [salt, expectedHash] = String(storedPasswordHash ?? '').split(':')
  if (!salt || !expectedHash) {
    return false
  }

  try {
    const calculatedHash = scryptSync(password, salt, AUTH_SCRYPT_KEY_LENGTH).toString('hex')
    const expectedBuffer = Buffer.from(expectedHash, 'hex')
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex')
    return expectedBuffer.length === calculatedBuffer.length && timingSafeEqual(expectedBuffer, calculatedBuffer)
  } catch {
    return false
  }
}

const createAuthSession = (userId) => {
  const createdAt = new Date().toISOString()
  return {
    token: randomBytes(AUTH_TOKEN_BYTES).toString('hex'),
    userId,
    createdAt,
    expiresAt: new Date(Date.now() + AUTH_SESSION_TTL_MS).toISOString(),
  }
}

const createSessionForUser = async (userId) => {
  const sessions = await readAuthSessions()
  const nextSession = createAuthSession(userId)
  const nextSessions = sessions.filter((session) => session.userId !== userId)
  nextSessions.push(nextSession)
  await writeJsonArrayFile(AUTH_SESSIONS_FILE_PATH, nextSessions)
  return nextSession
}

const removeSessionsForUser = async (userId, options = {}) => {
  const normalizedUserId = String(userId ?? '').trim()
  if (!normalizedUserId) {
    return false
  }

  const exceptToken = String(options?.exceptToken ?? '').trim()
  const sessions = await readAuthSessions()
  const nextSessions = sessions.filter(
    (session) => session.userId !== normalizedUserId || (exceptToken && session.token === exceptToken),
  )
  if (nextSessions.length === sessions.length) {
    return false
  }

  await writeJsonArrayFile(AUTH_SESSIONS_FILE_PATH, nextSessions)
  return true
}

const removeSessionByToken = async (token) => {
  const normalizedToken = String(token ?? '').trim()
  if (!normalizedToken) {
    return false
  }

  const sessions = await readAuthSessions()
  const nextSessions = sessions.filter((session) => session.token !== normalizedToken)
  if (nextSessions.length === sessions.length) {
    return false
  }

  await writeJsonArrayFile(AUTH_SESSIONS_FILE_PATH, nextSessions)
  return true
}

const readBearerToken = (req) => {
  const authorizationHeader = String(req.headers.authorization ?? '').trim()
  if (!authorizationHeader) {
    return ''
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2)
  return /^Bearer$/i.test(scheme) ? String(token ?? '').trim() : ''
}

const resolveAuthenticatedUser = async (token) => {
  const normalizedToken = String(token ?? '').trim()
  if (!normalizedToken) {
    return null
  }

  const sessions = await readAuthSessions()
  const activeSession = sessions.find((session) => session.token === normalizedToken)
  if (!activeSession) {
    return null
  }

  const users = await readAuthUsers()
  const user = users.find((entry) => entry.id === activeSession.userId)
  if (!user) {
    await removeSessionByToken(normalizedToken)
    return null
  }

  if (getAuthUserAccessState(user) !== AUTH_STATUS_ACTIVE) {
    await removeSessionByToken(normalizedToken)
    return null
  }

  return {
    session: activeSession,
    user,
  }
}

const hasFeaturePermission = (user, featureKey) => {
  if (!featureKey || !AUTH_PERMISSION_KEYS.includes(featureKey)) {
    return false
  }

  return user?.permissions?.[featureKey] === true
}

const ensureAdminRequest = (req, res, next) => {
  if (req.authUser?.role === AUTH_ROLE_ADMIN) {
    next()
    return
  }

  res.status(403).json({
    message: 'Only administrators can manage users.',
  })
}

const ensureFeatureRequest = (featureKey) => (req, res, next) => {
  if (hasFeaturePermission(req.authUser, featureKey)) {
    next()
    return
  }

  res.status(403).json({
    message: `You are not authorized to access ${AUTH_FEATURE_LABELS[featureKey] ?? 'this feature'}.`,
  })
}

const countActiveAdministrators = (users) =>
  users.filter((user) => user.role === AUTH_ROLE_ADMIN && getAuthUserAccessState(user) === AUTH_STATUS_ACTIVE).length

const ensureAtLeastOneActiveAdministrator = (users) => {
  if (countActiveAdministrators(users) < 1) {
    throw new Error('At least one active administrator is required.')
  }
}

const createAuthUserRecord = ({
  email,
  password,
  role = AUTH_ROLE_USER,
  status = AUTH_STATUS_ACTIVE,
  permissions = DEFAULT_AUTH_PERMISSIONS,
  displayName,
  username,
  phone = '',
  organization = '',
  expiresAt = '',
}) => {
  const timestamp = new Date().toISOString()
  return {
    id: randomUUID(),
    email,
    passwordHash: createPasswordHash(password),
    createdAt: timestamp,
    updatedAt: timestamp,
    displayName: normalizeDisplayName(displayName, email),
    username: normalizeUsername(username, email),
    phone: normalizeOptionalPhone(phone),
    organization: normalizeOptionalOrganization(organization),
    expiresAt: normalizeOptionalDateValue(expiresAt),
    role: normalizeAuthRole(role, AUTH_ROLE_USER),
    status: normalizeAuthStatus(status, AUTH_STATUS_ACTIVE),
    permissions: normalizeAuthPermissions(permissions),
    passwordUpdatedAt: timestamp,
  }
}

const normalizeExecutablePath = (value) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return ''
  }

  const quotedMatch = rawValue.match(/^"(.*)"$/)
  return quotedMatch ? quotedMatch[1].trim() : rawValue
}

const pushUniqueCandidate = (candidates, seen, candidate) => {
  const normalized = normalizeExecutablePath(candidate)
  if (!normalized) {
    return
  }

  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
  if (seen.has(key)) {
    return
  }

  seen.add(key)
  candidates.push(normalized)
}

const pushExistingCandidate = (candidates, seen, candidate) => {
  const normalized = normalizeExecutablePath(candidate)
  if (!normalized || !existsSync(normalized)) {
    return
  }

  pushUniqueCandidate(candidates, seen, normalized)
}

const getRscriptCommandCandidates = () => {
  /** @type {string[]} */
  const candidates = []
  const seen = new Set()

  /** @type {string[]} */
  const rRootCandidates = []
  const rRootSeen = new Set()
  const pushRRoot = (candidateRoot) => {
    const normalizedRoot = normalizeExecutablePath(candidateRoot)
    if (!normalizedRoot) {
      return
    }

    const key = process.platform === 'win32' ? normalizedRoot.toLowerCase() : normalizedRoot
    if (rRootSeen.has(key)) {
      return
    }

    rRootSeen.add(key)
    rRootCandidates.push(normalizedRoot)
  }

  /** @type {Set<string>} */
  const driveRoots = new Set()
  const addDriveRoot = (value) => {
    const normalizedValue = normalizeExecutablePath(value)
    if (!normalizedValue) {
      return
    }

    const parsed = path.parse(normalizedValue)
    if (parsed.root) {
      driveRoots.add(parsed.root)
    }
  }

  pushExistingCandidate(candidates, seen, process.env.RSCRIPT_PATH)
  pushExistingCandidate(candidates, seen, process.env.RSCRIPT)

  const rHome = normalizeExecutablePath(process.env.R_HOME)
  if (rHome) {
    pushExistingCandidate(candidates, seen, path.join(rHome, 'bin', 'Rscript.exe'))
    pushExistingCandidate(candidates, seen, path.join(rHome, 'bin', 'x64', 'Rscript.exe'))
    pushExistingCandidate(candidates, seen, path.join(rHome, 'bin', 'Rscript'))
  }

  if (process.platform === 'win32') {
    addDriveRoot(__dirname)
    addDriveRoot(process.cwd())
    addDriveRoot(process.env.USERPROFILE)
    addDriveRoot(process.env.HOMEDRIVE)
    addDriveRoot(process.env.SystemDrive)

    const programFilesRoots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      .map((root) => normalizeExecutablePath(root))
      .filter((root) => root.length > 0)

    for (const root of programFilesRoots) {
      pushRRoot(path.join(root, 'R'))
    }

    for (const driveRoot of driveRoots) {
      pushRRoot(path.join(driveRoot, 'Program Files', 'R'))
      pushRRoot(path.join(driveRoot, 'Program Files (x86)', 'R'))
    }

    for (const rRoot of rRootCandidates) {
      if (!existsSync(rRoot)) {
        continue
      }

      const versions = readdirSync(rRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^R[-_]/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' }))

      for (const version of versions) {
        const basePath = path.join(rRoot, version, 'bin')
        pushExistingCandidate(candidates, seen, path.join(basePath, 'Rscript.exe'))
        pushExistingCandidate(candidates, seen, path.join(basePath, 'x64', 'Rscript.exe'))
      }
    }

    const whereResult = spawnSync('where', ['Rscript'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    if (!whereResult.error && whereResult.status === 0) {
      const paths = whereResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      for (const executablePath of paths) {
        pushExistingCandidate(candidates, seen, executablePath)
      }
    }
  }

  // Keep command names last so PATH resolution still works when available.
  pushUniqueCandidate(candidates, seen, 'Rscript')
  pushUniqueCandidate(candidates, seen, 'Rscript.exe')

  return candidates
}

const getResolvedRscriptCandidate = () => {
  const candidates = getRscriptCommandCandidates()
  const existingPathCandidate = candidates.find((candidate) => {
    const normalized = normalizeExecutablePath(candidate)
    return normalized.includes(path.sep) && existsSync(normalized)
  })

  return existingPathCandidate ?? candidates[0] ?? ''
}

const delay = (timeoutMs) => new Promise((resolve) => setTimeout(resolve, timeoutMs))

const isRPlumberProcessAlive = () =>
  Boolean(rPlumberProcess) && rPlumberProcess.exitCode == null && !rPlumberProcess.killed

const getRPlumberSourceSignature = () =>
  R_PLUMBER_SOURCE_PATHS.map((targetPath) => {
    const normalizedPath = targetPath.replace(/\\/g, '/')
    if (!existsSync(targetPath)) {
      return `${normalizedPath}=missing`
    }

    const fileHash = createHash('md5').update(readFileSync(targetPath)).digest('hex')
    return `${normalizedPath}=${fileHash}`
  }).join('|')

const getRPlumberHealth = async () => {
  try {
    const response = await fetch(`${R_PLUMBER_BASE_URL}/health`)
    if (!response.ok) {
      return null
    }

    const payload = await response.json().catch(() => null)
    return payload?.status === 'ok' ? payload : null
  } catch {
    return null
  }
}

const pingRPlumberService = async () => {
  const payload = await getRPlumberHealth()
  return payload?.status === 'ok'
}

const waitForRPlumberReady = async (timeoutMs = R_PLUMBER_HEALTH_TIMEOUT_MS) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await pingRPlumberService()) {
      return true
    }

    await delay(250)
  }

  return false
}

const stopRPlumberService = async () => {
  if (!isRPlumberProcessAlive()) {
    rPlumberProcess = null
    rPlumberSourceSignature = ''
    return false
  }

  const child = rPlumberProcess
  rPlumberProcess = null
  rPlumberSourceSignature = ''

  child.kill()

  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(3000).then(() => false),
  ])

  if (!exited && process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    })
  }

  return true
}

const getListeningProcessIdsForPort = (port) => {
  const pids = new Set()

  if (!Number.isInteger(port) || port < 1) {
    return []
  }

  if (process.platform === 'win32') {
    const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8',
      windowsHide: true,
    })

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('TCP')) {
        continue
      }

      const parts = trimmed.split(/\s+/)
      if (parts.length < 5) {
        continue
      }

      const localAddress = parts[1]
      const state = parts[3]
      const pid = Number(parts[4])
      if (state !== 'LISTENING' || !Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
        continue
      }

      if (localAddress.endsWith(`:${port}`)) {
        pids.add(pid)
      }
    }

    return [...pids]
  }

  const result = spawnSync('lsof', ['-ti', `TCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  for (const line of output.split(/\r?\n/)) {
    const pid = Number(line.trim())
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
      pids.add(pid)
    }
  }

  return [...pids]
}

const stopStaleRPlumberProcessOnPort = async () => {
  const stalePids = getListeningProcessIdsForPort(R_PLUMBER_PORT)
  if (stalePids.length === 0) {
    return false
  }

  console.warn(`[r-plumber] Stopping stale process on port ${R_PLUMBER_PORT}: ${stalePids.join(', ')}`)

  if (process.platform === 'win32') {
    for (const pid of stalePids) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        encoding: 'utf8',
        windowsHide: true,
      })
    }
  } else {
    for (const pid of stalePids) {
      spawnSync('kill', ['-TERM', String(pid)], {
        encoding: 'utf8',
        windowsHide: true,
      })
    }
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt < 5000) {
    if (!(await pingRPlumberService())) {
      return true
    }
    await delay(200)
  }

  return !(await pingRPlumberService())
}

const startRPlumberService = async () => {
  const expectedSignature = getRPlumberSourceSignature()
  const healthPayload = await getRPlumberHealth()
  if (healthPayload) {
    const activeSignature =
      typeof healthPayload.signature === 'string' ? healthPayload.signature.trim() : ''
    const isStaleService = !activeSignature || activeSignature !== expectedSignature

    if (!isStaleService) {
      rPlumberSourceSignature = expectedSignature
      return 'connected'
    }

    if (R_PLUMBER_EXTERNAL) {
      throw new Error(`R plumber service at ${R_PLUMBER_BASE_URL} is running an outdated API version.`)
    }

    if (isRPlumberProcessAlive()) {
      console.warn('[r-plumber] Detected changed API sources, restarting owned plumber process.')
      await stopRPlumberService()
    } else {
      const stopped = await stopStaleRPlumberProcessOnPort()
      if (!stopped) {
        throw new Error(
          `Detected a stale R plumber service at ${R_PLUMBER_BASE_URL}. Stop the existing Rscript/plumber process and retry.`,
        )
      }
    }
  }

  if (R_PLUMBER_EXTERNAL) {
    throw new Error(`R plumber service is not reachable at ${R_PLUMBER_BASE_URL}.`)
  }

  if (isRPlumberProcessAlive()) {
    const isReady = await waitForRPlumberReady()
    if (isReady) {
      return 'reused'
    }
  }

  if (rPlumberStartupPromise) {
    return rPlumberStartupPromise
  }

  rPlumberStartupPromise = (async () => {
    const rscriptCandidate = getResolvedRscriptCandidate()
    if (!rscriptCandidate) {
      throw new Error('Rscript was not found. Install R and add Rscript to PATH, or set RSCRIPT_PATH / R_HOME for backend.')
    }

    if (!existsSync(R_PLUMBER_RUNNER_PATH)) {
      throw new Error(`R plumber runner was not found at ${R_PLUMBER_RUNNER_PATH}.`)
    }

    const child = spawn(rscriptCandidate, [R_PLUMBER_RUNNER_PATH], {
      cwd: __dirname,
      env: {
        ...process.env,
        PLUMBER_HOST: R_PLUMBER_HOST,
        PLUMBER_PORT: String(R_PLUMBER_PORT),
        PLUMBER_SOURCE_SIGNATURE: expectedSignature,
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    rPlumberProcess = child
    rPlumberSourceSignature = expectedSignature

    child.stdout?.on('data', (chunk) => {
      const message = String(chunk).trim()
      if (message) {
        console.log(`[r-plumber] ${message}`)
      }
    })

    child.stderr?.on('data', (chunk) => {
      const message = String(chunk).trim()
      if (message) {
        console.warn(`[r-plumber] ${message}`)
      }
    })

    child.on('exit', (code, signal) => {
      if (rPlumberProcess === child) {
        rPlumberProcess = null
        rPlumberSourceSignature = ''
      }
      console.warn(`[r-plumber] exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    })

    const isReady = await waitForRPlumberReady()
    if (!isReady) {
      if (isRPlumberProcessAlive()) {
        child.kill()
      }
      throw new Error(`Timed out waiting for R plumber service at ${R_PLUMBER_BASE_URL}.`)
    }

    return 'spawned'
  })()

  try {
    return await rPlumberStartupPromise
  } finally {
    rPlumberStartupPromise = null
  }
}

const ensureRPlumberService = async () => {
  const expectedSignature = getRPlumberSourceSignature()
  const healthPayload = await getRPlumberHealth()
  if (healthPayload) {
    if (!R_PLUMBER_EXTERNAL) {
      const activeSignature =
        typeof healthPayload.signature === 'string' ? healthPayload.signature.trim() : ''
      const isStaleService = !activeSignature || activeSignature !== expectedSignature
      if (isStaleService) {
        if (isRPlumberProcessAlive()) {
          console.warn('[r-plumber] Detected changed API sources, restarting owned plumber process.')
          await stopRPlumberService()
        } else {
          const stopped = await stopStaleRPlumberProcessOnPort()
          if (!stopped) {
            throw new Error(
              `Detected a stale R plumber service at ${R_PLUMBER_BASE_URL}. Stop the existing Rscript/plumber process and retry.`,
            )
          }
        }
      } else {
        rPlumberSourceSignature = expectedSignature
        return
      }
    } else {
      return
    }
  }

  if (await pingRPlumberService()) {
    return
  }

  await startRPlumberService()
}

const invokeRPlumber = async (endpointPath, payload, fallbackMessage) => {
  await ensureRPlumberService()

  let response
  try {
    response = await fetch(`${R_PLUMBER_BASE_URL}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? error.message
        : fallbackMessage,
    )
  }

  const text = await response.text()
  let parsed = {}
  if (text.trim()) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(text.trim() || fallbackMessage)
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed?.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : fallbackMessage
    throw new Error(message)
  }

  return parsed
}

const toIdPart = (value) => value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '_')
const toFolderId = (productType, productName) => `${toIdPart(productType)}::${toIdPart(productName)}`
const toTypeSourcePath = (productType) => `/database/${encodeURIComponent(productType)}`
const toFolderSourcePath = (productType, productName) =>
  `/database/${encodeURIComponent(productType)}/${encodeURIComponent(productName)}`
const toVersionSourcePath = (productType, productName, modelVersion) =>
  `${toFolderSourcePath(productType, productName)}/${encodeURIComponent(modelVersion)}`

const toModelIdentity = (version, fileName) =>
  `${String(version ?? '').trim().toLowerCase()}::${String(fileName ?? '').trim().toLowerCase()}`

const buildModelFilePath = (productPath, modelVersion, fileName) =>
  modelVersion === UNVERSIONED_MODEL_LABEL
    ? path.join(productPath, fileName)
    : path.join(productPath, modelVersion, fileName)

const getDeploymentMetaPath = (productPath) => path.join(productPath, DEPLOYMENT_META_FILE)

const readDeploymentMeta = async (productPath) => {
  const metaPath = getDeploymentMetaPath(productPath)
  if (!(await pathExists(metaPath))) {
    return null
  }

  try {
    const rawText = await fsPromises.readFile(metaPath, 'utf8')
    const payload = JSON.parse(rawText)
    const activeVersion = payload?.activeVersion
    if (
      activeVersion &&
      typeof activeVersion.version === 'string' &&
      activeVersion.version.trim()
    ) {
      return {
        activeVersion: {
          version: activeVersion.version.trim(),
          activatedAt:
            typeof activeVersion.activatedAt === 'string' && activeVersion.activatedAt.trim()
              ? activeVersion.activatedAt.trim()
              : '',
        },
      }
    }

    const activeModel = payload?.activeModel
    if (
      !activeModel ||
      typeof activeModel.version !== 'string' ||
      !activeModel.version.trim()
    ) {
      return null
    }

    return {
      activeVersion: {
        version: activeModel.version.trim(),
        activatedAt:
          typeof activeModel.activatedAt === 'string' && activeModel.activatedAt.trim()
            ? activeModel.activatedAt.trim()
            : '',
      },
    }
  } catch {
    return null
  }
}

const writeDeploymentMeta = async (productPath, activeVersion) => {
  const metaPath = getDeploymentMetaPath(productPath)
  if (!activeVersion) {
    if (await pathExists(metaPath)) {
      await fsPromises.unlink(metaPath)
    }
    return
  }

  const payload = {
    activeVersion: {
      version: activeVersion.version,
      activatedAt: activeVersion.activatedAt || formatDateTime(new Date()),
    },
  }
  await fsPromises.writeFile(metaPath, JSON.stringify(payload, null, 2), 'utf8')
}

const readVersionModelFiles = async (versionPath) => {
  if (!(await pathExists(versionPath))) {
    return {
      primaryFileName: '',
      allModelFileName: '',
      finalModelFileName: '',
    }
  }

  const entries = await fsPromises.readdir(versionPath, { withFileTypes: true })
  const deployableModelFiles = sortDeployableModelFiles(
    entries
      .filter((entry) => entry.isFile() && isDeployableModelFile(entry.name))
      .map((entry) => entry.name),
  )
  const primaryFileName = deployableModelFiles[0] ?? ''
  const allModelFileName = deployableModelFiles.find((fileName) => isAllModelFile(fileName)) ?? ''
  const finalModelFileName = deployableModelFiles.find((fileName) => isFinalModelFile(fileName)) ?? ''

  return {
    primaryFileName,
    allModelFileName,
    finalModelFileName,
  }
}

const resolveVersionModelFileName = async (productPath, modelVersion) => {
  const versionPath = buildVersionDirectoryPath(productPath, modelVersion)
  const { primaryFileName } = await readVersionModelFiles(versionPath)
  return primaryFileName
}

const resolveValidActiveModel = async (productPath) => {
  const deploymentMeta = await readDeploymentMeta(productPath)
  const activeVersion = deploymentMeta?.activeVersion
  if (!activeVersion) {
    return null
  }

  const fileName = await resolveVersionModelFileName(productPath, activeVersion.version)
  if (fileName) {
    return {
      version: activeVersion.version,
      fileName,
      activatedAt: activeVersion.activatedAt,
    }
  }

  await writeDeploymentMeta(productPath, null)
  return null
}

const normalizeCrossValidationRows = (rows) =>
  Array.isArray(rows)
    ? rows
        .map((row) => ({
          wflow_id: String(row?.wflow_id ?? '').trim(),
          rsq_mean: Number(row?.rsq_mean),
          rsq_sd: Number(row?.rsq_sd),
          rmse_mean: Number(row?.rmse_mean),
          rmse_sd: Number(row?.rmse_sd),
        }))
        .filter(
          (row) =>
            row.wflow_id.length > 0 &&
            Number.isFinite(row.rsq_mean) &&
            Number.isFinite(row.rsq_sd) &&
            Number.isFinite(row.rmse_mean) &&
            Number.isFinite(row.rmse_sd),
        )
    : []

const normalizeBestHyperparameterRows = (rows) =>
  Array.isArray(rows)
    ? rows
        .map((row) => ({
          model: String(row?.Model ?? '').trim(),
          hyperparameter: String(row?.Hyperparameter ?? '').trim(),
          value: row?.Value == null ? '' : String(row.Value).trim(),
        }))
        .filter((row) => row.model.length > 0 && row.hyperparameter.length > 0)
    : []

const normalizeAccuracyChartPoints = (rows) =>
  Array.isArray(rows)
    ? rows
        .map((row) => ({
          set: String(row?.set ?? '').trim(),
          actual: Number(row?.actual),
          predicted: Number(row?.predicted),
        }))
        .filter(
          (row) =>
            row.set.length > 0 && Number.isFinite(row.actual) && Number.isFinite(row.predicted),
        )
    : []

const normalizeExploreGridRows = (rows) =>
  Array.isArray(rows)
    ? rows
        .map((row) => ({
          category: String(row?.category ?? row?.Liner_category ?? '').trim(),
          density: Number(row?.density ?? row?.Liner_density),
          thickness: Number(row?.thickness ?? row?.Liner_thickness),
          predictedAcceleration: Number(row?.predictedAcceleration ?? row?.Pred),
          feasible: row?.feasible === true || String(row?.feasible ?? '').trim().toLowerCase() === 'true',
          materialUsage: Number(row?.materialUsage ?? row?.Material ?? row?.material),
        }))
        .filter(
          (row) =>
            row.category.length > 0 &&
            Number.isFinite(row.density) &&
            Number.isFinite(row.thickness) &&
            Number.isFinite(row.predictedAcceleration) &&
            Number.isFinite(row.materialUsage),
        )
    : []

const normalizeExploreBestRows = (rows) =>
  Array.isArray(rows)
    ? rows
        .map((row) => ({
          category: String(row?.category ?? row?.Liner_category ?? '').trim(),
          density: row?.density == null && row?.Liner_density == null ? null : Number(row?.density ?? row?.Liner_density),
          thickness:
            row?.thickness == null && row?.Liner_thickness == null ? null : Number(row?.thickness ?? row?.Liner_thickness),
          predictedAcceleration:
            row?.predictedAcceleration == null && row?.Pred == null
              ? null
              : Number(row?.predictedAcceleration ?? row?.Pred),
          materialUsage:
            row?.materialUsage == null && row?.Material == null && row?.material == null
              ? null
              : Number(row?.materialUsage ?? row?.Material ?? row?.material),
          feasibleCount:
            row?.feasibleCount == null && row?.Feasible_count == null
              ? 0
              : Number(row?.feasibleCount ?? row?.Feasible_count),
        }))
        .filter((row) => row.category.length > 0)
    : []

const normalizeNewTaskPredictionRows = (rows) =>
  Array.isArray(rows)
    ? rows
        .map((row) => ({
          id: String(row?.ID ?? row?.id ?? '').trim(),
          predictedAcceleration: Number(
            row?.predictedAcceleration ?? row?.['.pred'] ?? row?.pred ?? row?.Predicted_acceleration,
          ),
          predictedResult: String(row?.predictedResult ?? row?.class ?? '').trim(),
        }))
        .filter(
          (row) =>
            row.id.length > 0 &&
            Number.isFinite(row.predictedAcceleration) &&
            row.predictedResult.length > 0,
        )
    : []

const resolveNewTaskProject = (rawProjectName) => {
  const normalizedProjectName = String(rawProjectName ?? '').trim()
  if (!normalizedProjectName) {
    return {
      projectName: '',
      outputRoot: NEW_TASK_OUTPUT_ROOT,
    }
  }

  const projectName = ensureValidName(normalizedProjectName, 'projectName')
  return {
    projectName,
    outputRoot: path.join(NEW_TASK_OUTPUT_ROOT, projectName),
  }
}

const buildPredictedResultsFileName = (fileName) =>
  ensureValidFileName(
    `${path.basename(fileName, NEW_TASK_FILE_EXTENSION)}${NEW_TASK_PREDICTED_RESULTS_SUFFIX}${NEW_TASK_FILE_EXTENSION}`,
  )

const buildNewTaskSummaryPath = (outputRoot, fileName) =>
  path.join(
    outputRoot,
    `${path.basename(String(fileName ?? '').trim(), NEW_TASK_FILE_EXTENSION)}${NEW_TASK_SUMMARY_SUFFIX}`,
  )

const buildNewTaskStoragePaths = (rawProjectName, rawFileName) => {
  const { projectName, outputRoot } = resolveNewTaskProject(rawProjectName)
  const fileName = ensureValidFileName(rawFileName)
  const predictedResultsFileName = buildPredictedResultsFileName(fileName)
  return {
    projectName,
    outputRoot,
    fileName,
    taskInputPath: path.join(outputRoot, fileName),
    predictedResultsFileName,
    predictedResultsPath: path.join(outputRoot, predictedResultsFileName),
    summaryPath: buildNewTaskSummaryPath(outputRoot, fileName),
  }
}

const buildProjectMetaPath = (outputRoot) => path.join(outputRoot, PROJECT_META_FILE_NAME)

const normalizeProjectNotes = (rawValue) =>
  String(rawValue ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, PROJECT_NOTE_MAX_LENGTH)

const normalizeProjectMeta = (payload) => ({
  notes: normalizeProjectNotes(payload?.notes ?? payload?.note),
  pinned: payload?.pinned === true,
})

const readProjectMeta = async (outputRoot) => {
  const metaPath = buildProjectMetaPath(outputRoot)
  if (!(await pathExists(metaPath))) {
    return {
      notes: '',
      pinned: false,
    }
  }

  try {
    const rawContent = await fsPromises.readFile(metaPath, 'utf8')
    return normalizeProjectMeta(JSON.parse(rawContent))
  } catch {
    return {
      notes: '',
      pinned: false,
    }
  }
}

const writeProjectMeta = async (outputRoot, payload) => {
  const normalizedMeta = normalizeProjectMeta(payload)
  const metaPath = buildProjectMetaPath(outputRoot)
  await fsPromises.writeFile(
    metaPath,
    JSON.stringify(
      {
        ...normalizedMeta,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  )
  return normalizedMeta
}

const renameProjectOutputRoot = async (currentOutputRoot, nextOutputRoot) => {
  const currentComparablePath =
    process.platform === 'win32' ? currentOutputRoot.toLowerCase() : currentOutputRoot
  const nextComparablePath =
    process.platform === 'win32' ? nextOutputRoot.toLowerCase() : nextOutputRoot

  if (currentComparablePath === nextComparablePath) {
    if (currentOutputRoot === nextOutputRoot) {
      return
    }

    const tempOutputRoot = path.join(
      NEW_TASK_OUTPUT_ROOT,
      `.__project-rename-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    )
    await fsPromises.rename(currentOutputRoot, tempOutputRoot)
    await fsPromises.rename(tempOutputRoot, nextOutputRoot)
    return
  }

  await fsPromises.rename(currentOutputRoot, nextOutputRoot)
}

const readWorkbookRowsWithXlsx = (workbookPath, workbookFileName) => {
  try {
    const workbook = XLSX.readFile(workbookPath, {
      cellDates: false,
    })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return []
    }

    const firstSheet = workbook.Sheets[firstSheetName]
    if (!firstSheet) {
      return []
    }

    return XLSX.utils.sheet_to_json(firstSheet, {
      raw: false,
      defval: '',
      blankrows: false,
    })
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `Failed to read ${workbookFileName}.`,
    )
  }
}

const writeNewTaskSummary = async ({
  projectName,
  fileName,
  taskName,
  productType,
  productName,
  isMultiple,
  predictedResultsFileName,
  taskResults,
  pinned = false,
  archived = false,
}) => {
  const { outputRoot } = resolveNewTaskProject(projectName)
  const summaryPath = buildNewTaskSummaryPath(outputRoot, fileName)
  const payload = {
    projectName: String(projectName ?? '').trim(),
    fileName: String(fileName ?? '').trim(),
    taskName: String(taskName ?? '').trim(),
    productType: String(productType ?? '').trim(),
    productName: String(productName ?? '').trim(),
    isMultiple: Boolean(isMultiple),
    predictedResultsFileName: String(predictedResultsFileName ?? '').trim(),
    taskResults: normalizeNewTaskPredictionRows(taskResults),
    pinned: pinned === true,
    archived: archived === true,
    updatedAt: new Date().toISOString(),
  }

  await fsPromises.writeFile(summaryPath, JSON.stringify(payload, null, 2), 'utf8')
}

const persistNewTaskSummary = async (summaryPayload) => {
  try {
    await writeNewTaskSummary(summaryPayload)
  } catch (error) {
    console.warn(
      `Failed to persist task summary for ${String(summaryPayload?.fileName ?? '').trim() || 'unknown file'}: ${
        error instanceof Error ? error.message : 'Unknown error.'
      }`,
    )
  }
}

const readNewTaskSummary = async (fileName, rawProjectName) => {
  const { outputRoot } = resolveNewTaskProject(rawProjectName)
  const summaryPath = buildNewTaskSummaryPath(outputRoot, fileName)
  if (!(await pathExists(summaryPath))) {
    return null
  }

  try {
    const rawContent = await fsPromises.readFile(summaryPath, 'utf8')
    const payload = JSON.parse(rawContent)
    return {
      projectName: String(payload?.projectName ?? '').trim(),
      taskName: String(payload?.taskName ?? '').trim(),
      productType: String(payload?.productType ?? '').trim(),
      productName: String(payload?.productName ?? '').trim(),
      isMultiple: payload?.isMultiple === true,
      predictedResultsFileName: String(payload?.predictedResultsFileName ?? '').trim(),
      taskResults: normalizeNewTaskPredictionRows(payload?.taskResults),
      pinned: payload?.pinned === true,
      archived: payload?.archived === true,
    }
  } catch {
    return null
  }
}

const buildNewTaskSummaryPayload = async (fileName, rawProjectName) => {
  const { projectName, outputRoot } = resolveNewTaskProject(rawProjectName)
  const existingSummary = await readNewTaskSummary(fileName, projectName)
  const taskContext = await resolveHistoricalTaskContext(fileName, existingSummary)
  const predictedResultsFileName =
    String(existingSummary?.predictedResultsFileName ?? '').trim() || buildPredictedResultsFileName(fileName)

  return {
    outputRoot,
    summary: {
      projectName,
      fileName,
      taskName: taskContext.taskName || deriveTaskDisplayNameFromFile(fileName),
      productType: taskContext.productType,
      productName: taskContext.productName,
      isMultiple: taskContext.isMultiple,
      predictedResultsFileName,
      taskResults: existingSummary?.taskResults ?? [],
      pinned: existingSummary?.pinned === true,
      archived: existingSummary?.archived === true,
    },
  }
}

const moveNewTaskRecord = async ({
  fileName,
  currentProjectName,
  targetProjectName,
  predictedResultsFileName,
}) => {
  const { outputRoot: currentOutputRoot } = resolveNewTaskProject(currentProjectName)
  const { outputRoot: targetOutputRoot } = resolveNewTaskProject(targetProjectName)
  const currentTaskInputPath = path.join(currentOutputRoot, fileName)
  const currentSummaryPath = buildNewTaskSummaryPath(currentOutputRoot, fileName)
  const currentPredictedResultsPath = path.join(currentOutputRoot, predictedResultsFileName)
  const nextTaskInputPath = path.join(targetOutputRoot, fileName)
  const nextSummaryPath = buildNewTaskSummaryPath(targetOutputRoot, fileName)
  const nextPredictedResultsPath = path.join(targetOutputRoot, predictedResultsFileName)
  const currentComparablePath =
    process.platform === 'win32' ? currentOutputRoot.toLowerCase() : currentOutputRoot
  const nextComparablePath =
    process.platform === 'win32' ? targetOutputRoot.toLowerCase() : targetOutputRoot

  if (currentComparablePath === nextComparablePath) {
    return
  }

  if (await pathExists(nextTaskInputPath)) {
    throw new Error('A task with the same file name already exists in the target project.')
  }

  await ensureDir(targetOutputRoot)
  await fsPromises.rename(currentTaskInputPath, nextTaskInputPath)

  if (await pathExists(currentPredictedResultsPath)) {
    await fsPromises.rename(currentPredictedResultsPath, nextPredictedResultsPath)
  }

  if (await pathExists(currentSummaryPath)) {
    await fsPromises.rename(currentSummaryPath, nextSummaryPath)
  }
}

const listStoredProducts = async () => {
  await ensureDir(DATABASE_ROOT)
  const typeEntries = await fsPromises.readdir(DATABASE_ROOT, { withFileTypes: true })
  const products = []

  await Promise.all(
    typeEntries.map(async (typeEntry) => {
      if (!typeEntry.isDirectory()) {
        return
      }

      const typePath = path.join(DATABASE_ROOT, typeEntry.name)
      const productEntries = await fsPromises.readdir(typePath, { withFileTypes: true })
      for (const productEntry of productEntries) {
        if (!productEntry.isDirectory()) {
          continue
        }

        products.push({
          productType: typeEntry.name,
          productName: productEntry.name,
        })
      }
    }),
  )

  return products
}

const resolveHistoricalTaskContext = async (fileName, taskSummary) => {
  const normalizedTaskName = String(taskSummary?.taskName ?? '').trim()
  const normalizedProductType = String(taskSummary?.productType ?? '').trim()
  const normalizedProductName = String(taskSummary?.productName ?? '').trim()
  const baseName = path.basename(String(fileName ?? '').trim(), NEW_TASK_FILE_EXTENSION)
  const withoutPrefix = baseName.replace(/^Task_/i, '')
  const withoutPrefixLower = withoutPrefix.toLowerCase()
  const isMultiple = taskSummary?.isMultiple === true || withoutPrefixLower.endsWith('_multiple')

  if (normalizedProductType && normalizedProductName) {
    return {
      taskName: normalizedTaskName || deriveTaskDisplayNameFromFile(fileName),
      productType: normalizedProductType,
      productName: normalizedProductName,
      isMultiple,
    }
  }

  const products = (await listStoredProducts()).sort(
    (left, right) => right.productName.length - left.productName.length,
  )

  for (const product of products) {
    const productNameLower = product.productName.toLowerCase()
    if (!productNameLower) {
      continue
    }

    if (isMultiple) {
      const suffix = `_${productNameLower}_multiple`
      if (!withoutPrefixLower.endsWith(suffix)) {
        continue
      }

      const taskName = withoutPrefix.slice(0, withoutPrefix.length - suffix.length)
      if (!taskName.trim()) {
        continue
      }

      return {
        taskName,
        productType: product.productType,
        productName: product.productName,
        isMultiple: true,
      }
    }

    const marker = `_${productNameLower}_`
    const markerIndex = withoutPrefixLower.lastIndexOf(marker)
    if (markerIndex < 1) {
      continue
    }

    const taskName = withoutPrefix.slice(0, markerIndex)
    const targetId = withoutPrefix.slice(markerIndex + marker.length)
    if (!taskName.trim() || !targetId.trim()) {
      continue
    }

    return {
      taskName,
      productType: product.productType,
      productName: product.productName,
      isMultiple: false,
    }
  }

  return {
    taskName: normalizedTaskName || deriveTaskDisplayNameFromFile(fileName),
    productType: normalizedProductType,
    productName: normalizedProductName,
    isMultiple,
  }
}

const buildNewTaskProjectRecord = async (projectName) => {
  const { projectName: normalizedProjectName, outputRoot } = resolveNewTaskProject(projectName)
  const metaPath = buildProjectMetaPath(outputRoot)
  const [stats, entries, meta, metaStats] = await Promise.all([
    fsPromises.stat(outputRoot),
    fsPromises.readdir(outputRoot, { withFileTypes: true }),
    readProjectMeta(outputRoot),
    pathExists(metaPath)
      ? fsPromises.stat(metaPath).catch(() => null)
      : Promise.resolve(null),
  ])
  const taskFiles = entries.filter((entry) => entry.isFile() && isNewTaskInputWorkbook(entry.name))
  const taskSummaries = await Promise.all(
    taskFiles.map((entry) =>
      readNewTaskSummary(entry.name, normalizedProjectName).catch(() => null),
    ),
  )
  const taskCount = taskSummaries.filter((summary) => summary?.archived !== true).length
  const createdAt =
    stats.birthtime instanceof Date && !Number.isNaN(stats.birthtime.getTime()) ? stats.birthtime : stats.mtime
  const modifiedAt =
    metaStats?.mtime instanceof Date && !Number.isNaN(metaStats.mtime.getTime()) && metaStats.mtime > stats.mtime
      ? metaStats.mtime
      : stats.mtime

  return {
    projectName: normalizedProjectName,
    createdAt: createdAt.toISOString(),
    modifiedAt: modifiedAt.toISOString(),
    taskCount,
    notes: meta.notes,
    pinned: meta.pinned,
  }
}

const listNewTaskProjects = async () => {
  await ensureDir(NEW_TASK_OUTPUT_ROOT)
  const entries = await fsPromises.readdir(NEW_TASK_OUTPUT_ROOT, { withFileTypes: true })
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => buildNewTaskProjectRecord(entry.name)),
  )

  return projects.sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1
    }

    const modifiedAtDiff = right.modifiedAt.localeCompare(left.modifiedAt)
    return modifiedAtDiff !== 0
      ? modifiedAtDiff
      : left.projectName.localeCompare(right.projectName, undefined, { sensitivity: 'base' })
  })
}

const listNewTaskEntries = async () => {
  await ensureDir(NEW_TASK_OUTPUT_ROOT)
  const rootEntries = await fsPromises.readdir(NEW_TASK_OUTPUT_ROOT, { withFileTypes: true })
  const taskEntries = []

  const appendTaskEntry = async (projectName, outputRoot, entryName) => {
    const filePath = path.join(outputRoot, entryName)
    const summaryPath = buildNewTaskSummaryPath(outputRoot, entryName)
    const [stats, taskSummary, summaryStats] = await Promise.all([
      fsPromises.stat(filePath),
      readNewTaskSummary(entryName, projectName).catch(() => null),
      pathExists(summaryPath)
        ? fsPromises.stat(summaryPath).catch(() => null)
        : Promise.resolve(null),
    ])
    const taskContext = await resolveHistoricalTaskContext(entryName, taskSummary)
    const createdAt =
      stats.birthtime instanceof Date && !Number.isNaN(stats.birthtime.getTime()) ? stats.birthtime : stats.mtime
    const modifiedAt =
      summaryStats?.mtime instanceof Date && !Number.isNaN(summaryStats.mtime.getTime()) && summaryStats.mtime > stats.mtime
        ? summaryStats.mtime
        : stats.mtime

    taskEntries.push({
      fileName: entryName,
      filePath,
      taskName: taskContext.taskName || deriveTaskDisplayNameFromFile(entryName),
      modifiedAt: modifiedAt.toISOString(),
      createdAt: createdAt.toISOString(),
      isMultiple: taskContext.isMultiple,
      projectName,
      pinned: taskSummary?.pinned === true,
      archived: taskSummary?.archived === true,
    })
  }

  await Promise.all(
    rootEntries.map(async (entry) => {
      if (entry.isFile() && isNewTaskInputWorkbook(entry.name)) {
        await appendTaskEntry('', NEW_TASK_OUTPUT_ROOT, entry.name)
        return
      }

      if (!entry.isDirectory()) {
        return
      }

      const projectRoot = path.join(NEW_TASK_OUTPUT_ROOT, entry.name)
      const projectEntries = await fsPromises.readdir(projectRoot, { withFileTypes: true })
      await Promise.all(
        projectEntries
          .filter((projectEntry) => projectEntry.isFile() && isNewTaskInputWorkbook(projectEntry.name))
          .map((projectEntry) => appendTaskEntry(entry.name, projectRoot, projectEntry.name)),
      )
    }),
  )

  return taskEntries.sort((left, right) => {
    if (left.archived !== right.archived) {
      return left.archived ? 1 : -1
    }

    if (!left.archived && left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1
    }

    const modifiedAtDiff = right.modifiedAt.localeCompare(left.modifiedAt)
    return modifiedAtDiff !== 0
      ? modifiedAtDiff
      : left.taskName.localeCompare(right.taskName, undefined, { sensitivity: 'base' })
  })
}

const normalizeNewTaskShapSteps = (rows) =>
  Array.isArray(rows)
    ? rows
        .map((row) => {
          const rawFeature = String(row?.feature ?? '').trim()
          return {
            feature: SHAP_FEATURE_DISPLAY_NAME_MAP[rawFeature] ?? rawFeature,
            featureValue:
              row?.featureValue == null
                ? ''
                : String(row.featureValue).trim(),
            contribution: Number(row?.contribution),
            start: Number(row?.start),
            end: Number(row?.end),
            direction:
              String(row?.direction ?? '').trim().toLowerCase() === 'negative'
                ? 'negative'
                : 'positive',
          }
        })
        .filter(
          (row) =>
            row.feature.length > 0 &&
            Number.isFinite(row.contribution) &&
            Number.isFinite(row.start) &&
            Number.isFinite(row.end),
        )
    : []

const isNewTaskInputWorkbook = (fileName) => {
  const normalized = String(fileName ?? '').trim().toLowerCase()
  if (!normalized.endsWith(NEW_TASK_FILE_EXTENSION)) {
    return false
  }
  if (!normalized.startsWith('task_')) {
    return false
  }
  return !normalized.includes(`${NEW_TASK_PREDICTED_RESULTS_SUFFIX}${NEW_TASK_FILE_EXTENSION}`)
}

const deriveTaskDisplayNameFromFile = (fileName) => {
  const baseName = path.basename(String(fileName ?? ''), NEW_TASK_FILE_EXTENSION)
  const withoutPrefix = baseName.replace(/^Task_/i, '')
  const chunks = withoutPrefix.split('_').filter((chunk) => chunk.length > 0)
  if (chunks.length < 2) {
    return withoutPrefix || baseName
  }
  return chunks.slice(0, Math.max(chunks.length - 2, 1)).join('_')
}

const normalizeLookupKey = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const MULTIPLE_TASK_COLUMN_ALIASES = {
  productId: ['ID', 'Product ID'],
  productMass: ['Product mass', 'Product_mass', 'Product mass (kg)', 'Product mass(kg)', 'Product mass kg'],
  dropHeight: ['Drop_height', 'Drop height', 'Drop_height (cm)', 'Drop height (cm)'],
  tvLength: ['Product length', 'Product length (cm)', 'Product length(cm)', 'TV_length', 'TV length'],
  tvWidth: ['Product width', 'Product width (cm)', 'Product width(cm)', 'TV_width', 'TV width'],
  tvHeight: ['Product height', 'Product height (cm)', 'Product height(cm)', 'TV_height', 'TV height'],
  linerCategory: ['Liner category', 'Liner_category'],
  linerDensity: [
    'Liner density',
    'Liner_density',
    'Liner density (kg/m3)',
    'Liner density (kg/m^3)',
    'Liner density(kg/m3)',
  ],
  linerThickness: ['Liner thickness', 'Liner_thickness', 'Liner thickness (cm)', 'Liner thickness(cm)'],
  productFragility: [
    'Product fragility',
    'Product_fragility',
    'Product fragility (g)',
    'Product fragility(g)',
    'Peak_acceleration',
    'Peak acceleration',
  ],
}

const toNormalizedHeaderRow = (rawRow) =>
  Array.isArray(rawRow) ? rawRow.map((cell) => String(cell ?? '').trim()) : []

const countMatchedHeaders = (headerRow) => {
  const normalizedHeaderRow = headerRow.map((value) => normalizeLookupKey(value))
  const aliasGroups = [
    MULTIPLE_TASK_COLUMN_ALIASES.productId,
    [...MULTIPLE_TASK_COLUMN_ALIASES.productMass, ...MULTIPLE_TASK_COLUMN_ALIASES.dropHeight],
    MULTIPLE_TASK_COLUMN_ALIASES.tvLength,
    MULTIPLE_TASK_COLUMN_ALIASES.tvWidth,
    MULTIPLE_TASK_COLUMN_ALIASES.tvHeight,
    MULTIPLE_TASK_COLUMN_ALIASES.linerCategory,
    MULTIPLE_TASK_COLUMN_ALIASES.linerDensity,
    MULTIPLE_TASK_COLUMN_ALIASES.linerThickness,
    MULTIPLE_TASK_COLUMN_ALIASES.productFragility,
  ]

  return aliasGroups.reduce((matchedCount, aliases) => {
    const aliasSet = new Set(aliases.map((alias) => normalizeLookupKey(alias)))
    const hasMatch = normalizedHeaderRow.some((header) => aliasSet.has(header))
    return matchedCount + (hasMatch ? 1 : 0)
  }, 0)
}

const readSheetRowsFromBuffer = (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('No worksheet found in uploaded scheme file.')
  }

  const firstSheet = workbook.Sheets[firstSheetName]
  const sheetRows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  })

  const normalizedRows = Array.isArray(sheetRows)
    ? sheetRows
        .filter((row) => Array.isArray(row))
        .map((row) => toNormalizedHeaderRow(row))
        .filter((row) => row.some((cell) => cell.length > 0))
    : []

  if (normalizedRows.length < 2) {
    throw new Error('Uploaded scheme file does not contain enough rows.')
  }

  const maxColumnCount = Math.max(...normalizedRows.map((row) => row.length), 1)
  return normalizedRows.map((row) =>
    Array.from({ length: maxColumnCount }, (_, index) => row[index] ?? ''),
  )
}

const resolveMultipleTaskColumnIndex = (normalizedHeaderKeys, aliases) => {
  const aliasKeys = new Set(aliases.map((alias) => normalizeLookupKey(alias)))
  return normalizedHeaderKeys.findIndex((headerKey) => aliasKeys.has(headerKey))
}

const parseNumericCell = (rawValue) => {
  if (typeof rawValue === 'number') {
    return rawValue
  }

  const normalized = String(rawValue ?? '')
    .trim()
    .replace(/,/g, '')
  if (!normalized) {
    return Number.NaN
  }

  return Number(normalized)
}

const buildMultipleTaskRowsFromScheme = (fileBuffer) => {
  const rows = readSheetRowsFromBuffer(fileBuffer)

  let bestHeaderRowIndex = 0
  let bestMatchCount = -1
  const maxHeaderScan = Math.min(rows.length, 6)
  for (let index = 0; index < maxHeaderScan; index += 1) {
    const currentMatchCount = countMatchedHeaders(rows[index])
    if (currentMatchCount > bestMatchCount) {
      bestMatchCount = currentMatchCount
      bestHeaderRowIndex = index
    }
  }

  if (bestMatchCount < 6) {
    throw new Error('Uploaded scheme file headers do not match required template columns.')
  }

  const headerRow = rows[bestHeaderRowIndex]
  const normalizedHeaderKeys = headerRow.map((header) => normalizeLookupKey(header))
  const dataRows = rows.slice(bestHeaderRowIndex + 1).filter((row) => row.some((cell) => cell.trim().length > 0))
  if (dataRows.length < 1) {
    throw new Error('Uploaded scheme file has no data rows.')
  }

  const productIdIndex = resolveMultipleTaskColumnIndex(normalizedHeaderKeys, MULTIPLE_TASK_COLUMN_ALIASES.productId)
  const productMassIndex = resolveMultipleTaskColumnIndex(normalizedHeaderKeys, MULTIPLE_TASK_COLUMN_ALIASES.productMass)
  const dropHeightIndex = resolveMultipleTaskColumnIndex(normalizedHeaderKeys, MULTIPLE_TASK_COLUMN_ALIASES.dropHeight)
  const tvLengthIndex = resolveMultipleTaskColumnIndex(normalizedHeaderKeys, MULTIPLE_TASK_COLUMN_ALIASES.tvLength)
  const tvWidthIndex = resolveMultipleTaskColumnIndex(normalizedHeaderKeys, MULTIPLE_TASK_COLUMN_ALIASES.tvWidth)
  const tvHeightIndex = resolveMultipleTaskColumnIndex(normalizedHeaderKeys, MULTIPLE_TASK_COLUMN_ALIASES.tvHeight)
  const linerCategoryIndex = resolveMultipleTaskColumnIndex(
    normalizedHeaderKeys,
    MULTIPLE_TASK_COLUMN_ALIASES.linerCategory,
  )
  const linerDensityIndex = resolveMultipleTaskColumnIndex(normalizedHeaderKeys, MULTIPLE_TASK_COLUMN_ALIASES.linerDensity)
  const linerThicknessIndex = resolveMultipleTaskColumnIndex(
    normalizedHeaderKeys,
    MULTIPLE_TASK_COLUMN_ALIASES.linerThickness,
  )
  const productFragilityIndex = resolveMultipleTaskColumnIndex(
    normalizedHeaderKeys,
    MULTIPLE_TASK_COLUMN_ALIASES.productFragility,
  )

  const requiredIndexes = [
    ['Product ID', productIdIndex],
    ['Product length', tvLengthIndex],
    ['Product width', tvWidthIndex],
    ['Product height', tvHeightIndex],
    ['Liner category', linerCategoryIndex],
    ['Liner density', linerDensityIndex],
    ['Liner thickness', linerThicknessIndex],
    ['Product fragility', productFragilityIndex],
  ]
  for (const [label, index] of requiredIndexes) {
    if (index < 0) {
      throw new Error(`Uploaded scheme file is missing required column: ${label}.`)
    }
  }
  if (productMassIndex < 0 && dropHeightIndex < 0) {
    throw new Error('Uploaded scheme file must contain either Product mass or Drop_height column.')
  }

  const taskRows = dataRows.map((row, rowIndex) => {
    const currentRowNumber = bestHeaderRowIndex + rowIndex + 2
    const id = String(row[productIdIndex] ?? '').trim()
    const linerCategory = String(row[linerCategoryIndex] ?? '').trim()
    const tvLength = parseNumericCell(row[tvLengthIndex])
    const tvWidth = parseNumericCell(row[tvWidthIndex])
    const tvHeight = parseNumericCell(row[tvHeightIndex])
    const linerDensity = parseNumericCell(row[linerDensityIndex])
    const linerThickness = parseNumericCell(row[linerThicknessIndex])
    const productFragility = parseNumericCell(row[productFragilityIndex])
    const dropHeightDirect = dropHeightIndex >= 0 ? parseNumericCell(row[dropHeightIndex]) : Number.NaN
    const productMass = productMassIndex >= 0 ? parseNumericCell(row[productMassIndex]) : Number.NaN
    const dropHeight = Number.isFinite(dropHeightDirect)
      ? dropHeightDirect
      : Number.isFinite(productMass)
        ? getDropHeightByProductMass(productMass)
        : Number.NaN

    if (!id) {
      throw new Error(`Row ${currentRowNumber}: Product ID is required.`)
    }
    if (!linerCategory) {
      throw new Error(`Row ${currentRowNumber}: Liner category is required.`)
    }

    const numericChecks = [
      ['Drop_height', dropHeight],
      ['TV_length', tvLength],
      ['TV_width', tvWidth],
      ['TV_height', tvHeight],
      ['Liner_density', linerDensity],
      ['Liner_thickness', linerThickness],
      ['Product_fragility', productFragility],
    ]
    for (const [label, value] of numericChecks) {
      if (!Number.isFinite(value)) {
        throw new Error(`Row ${currentRowNumber}: ${label} is invalid.`)
      }
    }

    return {
      ID: id,
      Drop_height: dropHeight,
      TV_length: tvLength,
      TV_width: tvWidth,
      TV_height: tvHeight,
      Liner_category: linerCategory,
      Liner_density: linerDensity,
      Liner_thickness: linerThickness,
      Product_fragility: productFragility,
    }
  })

  return {
    taskRows,
    headerRowIndex: bestHeaderRowIndex,
  }
}

const BEST_HYPERPARAMETER_MODEL_ALIASES = {
  xgboost: ['XGBoost', 'Extreme gradient boosting (XGBoost)', 'xgboost'],
  svm: ['SVM', 'Support vector machine (SVM)', 'svm'],
  rf: ['RF', 'Random forest (RF)', 'Random forest', 'rand_forest', 'randomforest'],
  knn: ['KNN', 'k nearest neighbors', 'k-nearest neighbors'],
  mars: ['MARS', 'mars'],
  lr: ['LR', 'Linear regression (LR)', 'linear regression', 'glmnet', 'lm'],
}

const matchesBestHyperparameterModel = (rowModel, requestedAlgorithm) => {
  const requestedKey = normalizeLookupKey(requestedAlgorithm)
  const rowKey = normalizeLookupKey(rowModel)
  if (!requestedKey || !rowKey) {
    return false
  }

  if (rowKey === requestedKey) {
    return true
  }

  const aliases = BEST_HYPERPARAMETER_MODEL_ALIASES[requestedKey] ?? [requestedAlgorithm]
  return aliases.some((alias) => normalizeLookupKey(alias) === rowKey)
}

const findVersionAttachmentPath = async ({
  productPath,
  productType,
  productName,
  modelVersion,
  baseNames,
  allowedExtensions,
}) => {
  const versionPath = buildVersionDirectoryPath(productPath, modelVersion)
  if (!(await pathExists(versionPath))) {
    return null
  }

  const entries = await fsPromises.readdir(versionPath, { withFileTypes: true })
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const fileNameLookup = new Map(fileNames.map((fileName) => [fileName.toLowerCase(), fileName]))
  const normalizedBaseNames = [...new Set((Array.isArray(baseNames) ? baseNames : [baseNames]).map((baseName) =>
    String(baseName ?? '').trim(),
  ))].filter(Boolean)
  const preferredBaseNames = normalizedBaseNames.flatMap((baseName) => [
    sanitizeFileName(`${productName}_${modelVersion}_${baseName}`),
    sanitizeFileName(`${productType}_${modelVersion}_${baseName}`),
  ])

  for (const preferredBaseName of preferredBaseNames) {
    for (const extension of allowedExtensions) {
      const candidate = `${preferredBaseName}${extension}`.toLowerCase()
      const matchedFileName = fileNameLookup.get(candidate)
      if (matchedFileName) {
        return path.join(versionPath, matchedFileName)
      }
    }
  }

  for (const fileName of fileNames) {
    const extension = getFileExtension(fileName)
    if (!allowedExtensions.has(extension)) {
      continue
    }

    const stem = fileName.slice(0, -extension.length).toLowerCase()
    if (
      normalizedBaseNames.some((baseName) =>
        stem.endsWith(`_${String(baseName ?? '').trim().toLowerCase()}`),
      )
    ) {
      return path.join(versionPath, fileName)
    }
  }

  return null
}

const readWorkbookRows = (workbookPath, workbookFileName) => {
  const pythonScript = String.raw`import json
import sys

from openpyxl import load_workbook

path = sys.argv[1]
workbook = load_workbook(path, data_only=True)
worksheet = workbook[workbook.sheetnames[0]]
rows = list(worksheet.iter_rows(values_only=True))

if not rows:
    print(json.dumps({"rows": []}, ensure_ascii=False))
    raise SystemExit(0)

headers = [str(cell).strip() if cell is not None else "" for cell in rows[0]]
payload_rows = []

for row in rows[1:]:
    item = {}
    for index, header in enumerate(headers):
        if not header:
            continue
        item[header] = row[index] if index < len(row) else None

    if not any(value not in (None, "") for value in item.values()):
        continue

    payload_rows.append(item)

print(json.dumps({"rows": payload_rows}, ensure_ascii=False))`

  const commandCandidates = [
    { command: 'python', args: ['-c', pythonScript, workbookPath] },
    { command: 'py', args: ['-3', '-c', pythonScript, workbookPath] },
  ]

  /** @type {Error | null} */
  let lastError = null

  for (const candidate of commandCandidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    })

    if (result.error) {
      lastError = result.error
      if (result.error.code === 'ENOENT') {
        continue
      }

      throw result.error
    }

    if (typeof result.status !== 'number' || result.status !== 0) {
      const message = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
      throw new Error(message || `Failed to read ${workbookFileName}.`)
    }

    const stdout = result.stdout.trim()
    if (!stdout) {
      return []
    }

    let payload
    try {
      payload = JSON.parse(stdout)
    } catch {
      throw new Error(`Existing ${workbookFileName} returned invalid JSON.`)
    }

    return Array.isArray(payload?.rows) ? payload.rows : []
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : `Python is required to read ${workbookFileName}.`,
  )
}

const readValidationAccuracyRows = (workbookPath) =>
  normalizeCrossValidationRows(readWorkbookRows(workbookPath, VALIDATION_ACCURACY_FILE_NAME))

const readBestHyperparameterRows = (workbookPath) =>
  normalizeBestHyperparameterRows(readWorkbookRows(workbookPath, BEST_HYPERPARAMETER_FILE_NAME))

const runValidationAccuracyAnalysis = async (modelFilePath, workbookPath) => {
  const rScript = String.raw`args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop("Expected model and output paths.")
}

model_path <- normalizePath(args[[1]], winslash = "/", mustWork = TRUE)
output_path <- normalizePath(args[[2]], winslash = "/", mustWork = FALSE)
dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)

suppressPackageStartupMessages({
  library(tidymodels)
  library(dplyr)
  library(tidyr)
  library(rio)
})

ml_results <- readRDS(model_path)

validation_accuracy <- collect_metrics(ml_results, summarize = TRUE) %>%
  dplyr::filter(.metric == "rsq") %>%
  dplyr::group_by(wflow_id) %>%
  dplyr::slice_max(order_by = mean, n = 1, with_ties = FALSE) %>%
  dplyr::ungroup() %>%
  dplyr::select(wflow_id, .config, mean, std_err, n)

fold_metrics <- collect_metrics(ml_results, summarize = FALSE) %>%
  dplyr::filter(.metric %in% c("rsq", "rmse")) %>%
  dplyr::select(wflow_id, id, .config, .metric, .estimate)

fold_best <- fold_metrics %>%
  dplyr::inner_join(
    validation_accuracy %>% dplyr::select(wflow_id, .config),
    by = c("wflow_id", ".config")
  ) %>%
  tidyr::pivot_wider(names_from = .metric, values_from = .estimate) %>%
  dplyr::arrange(wflow_id, id)

validation_accuracy_all <- fold_best %>%
  dplyr::group_by(wflow_id) %>%
  dplyr::summarise(
    rsq_mean = mean(rsq, na.rm = TRUE),
    rsq_sd = stats::sd(rsq, na.rm = TRUE),
    rmse_mean = mean(rmse, na.rm = TRUE),
    rmse_sd = stats::sd(rmse, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  dplyr::arrange(desc(rsq_mean)) %>%
  dplyr::mutate(
    wflow_id = factor(wflow_id, levels = wflow_id),
    wflow_id = as.character(wflow_id)
  )

workbook_generated <- FALSE
workbook_message <- ""

tryCatch({
  rio::export(validation_accuracy_all, output_path)
  workbook_generated <- file.exists(output_path)
  if (!workbook_generated) {
    workbook_message <- sprintf("%s was not written to %s", basename(output_path), output_path)
  }
}, error = function(err) {
  workbook_message <<- conditionMessage(err)
})

payload <- list(
  rows = validation_accuracy_all %>%
    dplyr::mutate(
      wflow_id = as.character(wflow_id),
      rsq_mean = as.numeric(rsq_mean),
      rsq_sd = as.numeric(rsq_sd),
      rmse_mean = as.numeric(rmse_mean),
      rmse_sd = as.numeric(rmse_sd)
    ) %>%
    as.data.frame(stringsAsFactors = FALSE),
  workbookGenerated = workbook_generated,
  workbookMessage = workbook_message
)

cat(jsonlite::toJSON(payload, dataframe = "rows", auto_unbox = TRUE, na = "null"))
`

  const tempDirPath = path.join(__dirname, '.tmp')
  const tempScriptPath = path.join(
    tempDirPath,
    `generate-validation-accuracy-${process.pid}-${Date.now()}.R`,
  )

  await ensureDir(tempDirPath)
  await fsPromises.writeFile(tempScriptPath, rScript, 'utf8')

  const commandCandidates = getRscriptCommandCandidates()
  /** @type {Error | null} */
  let lastError = null
  let hasSpawnedAnyCommand = false

  try {
    for (const command of commandCandidates) {
      const result = spawnSync(command, [tempScriptPath, modelFilePath, workbookPath], {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      })

      if (result.error) {
        lastError = result.error
        if (result.error.code === 'ENOENT') {
          continue
        }

        throw result.error
      }

      hasSpawnedAnyCommand = true

      if (typeof result.status !== 'number' || result.status !== 0) {
        const message = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
        throw new Error(message || `Failed to generate ${VALIDATION_ACCURACY_FILE_NAME}.`)
      }

      const stdout = result.stdout.trim()
      if (!stdout) {
        throw new Error('R returned an empty response.')
      }

      let payload
      try {
        payload = JSON.parse(stdout)
      } catch {
        const preview = stdout.length > 280 ? `${stdout.slice(0, 277)}...` : stdout
        throw new Error(`R returned invalid JSON. ${preview}`)
      }

      return {
        command,
        rows: normalizeCrossValidationRows(payload?.rows),
        workbookGenerated: Boolean(payload?.workbookGenerated),
        workbookMessage:
          typeof payload?.workbookMessage === 'string' ? payload.workbookMessage.trim() : '',
      }
    }

    throw new Error(
      hasSpawnedAnyCommand
        ? lastError instanceof Error
          ? lastError.message
          : `Failed to run Rscript for ${VALIDATION_ACCURACY_FILE_NAME}.`
        : `Rscript was not found. Install R and add Rscript to PATH, or set RSCRIPT_PATH / R_HOME for backend.`,
    )
  } finally {
    await fsPromises.rm(tempScriptPath, { force: true }).catch(() => {})
  }
}

const runBestHyperparameterAnalysis = async (modelFilePath, workbookPath) => {
  const rScript = String.raw`args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop("Expected model and output paths.")
}

model_path <- normalizePath(args[[1]], winslash = "/", mustWork = TRUE)
output_path <- normalizePath(args[[2]], winslash = "/", mustWork = FALSE)
dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)

suppressPackageStartupMessages({
  library(tidymodels)
  library(dplyr)
  library(tidyr)
  library(purrr)
  library(rio)
})

ml_results <- readRDS(model_path)

extract_best_hyperparams <- function(ml_results, metric = "rsq") {
  best_hyperparams_all <- ml_results %>%
    dplyr::distinct(wflow_id) %>%
    dplyr::pull(wflow_id) %>%
    purrr::map_dfr(function(wid) {
      extract_workflow_set_result(ml_results, wid) %>%
        select_best(metric = metric) %>%
        dplyr::mutate(wflow_id = wid)
    })

  best_hyperparams_all %>%
    tidyr::pivot_longer(
      cols = -c(wflow_id, .config),
      names_to = "hyperparameter",
      values_to = "value",
      values_transform = list(value = as.character)
    ) %>%
    dplyr::filter(!is.na(value)) %>%
    dplyr::transmute(
      Model = as.character(wflow_id),
      Hyperparameter = as.character(hyperparameter),
      Value = as.character(value)
    ) %>%
    dplyr::arrange(Model, Hyperparameter)
}

best_hyperparams <- extract_best_hyperparams(ml_results, "rsq")

workbook_generated <- FALSE
workbook_message <- ""

tryCatch({
  rio::export(best_hyperparams, output_path)
  workbook_generated <- file.exists(output_path)
  if (!workbook_generated) {
    workbook_message <- sprintf("%s was not written to %s", basename(output_path), output_path)
  }
}, error = function(err) {
  workbook_message <<- conditionMessage(err)
})

payload <- list(
  rows = best_hyperparams %>% as.data.frame(stringsAsFactors = FALSE),
  workbookGenerated = workbook_generated,
  workbookMessage = workbook_message
)

cat(jsonlite::toJSON(payload, dataframe = "rows", auto_unbox = TRUE, na = "null"))
`

  const tempDirPath = path.join(__dirname, '.tmp')
  const tempScriptPath = path.join(
    tempDirPath,
    `generate-best-hyperparameter-${process.pid}-${Date.now()}.R`,
  )

  await ensureDir(tempDirPath)
  await fsPromises.writeFile(tempScriptPath, rScript, 'utf8')

  const commandCandidates = getRscriptCommandCandidates()
  /** @type {Error | null} */
  let lastError = null
  let hasSpawnedAnyCommand = false

  try {
    for (const command of commandCandidates) {
      const result = spawnSync(command, [tempScriptPath, modelFilePath, workbookPath], {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      })

      if (result.error) {
        lastError = result.error
        if (result.error.code === 'ENOENT') {
          continue
        }

        throw result.error
      }

      hasSpawnedAnyCommand = true

      if (typeof result.status !== 'number' || result.status !== 0) {
        const message = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
        throw new Error(message || `Failed to generate ${BEST_HYPERPARAMETER_FILE_NAME}.`)
      }

      const stdout = result.stdout.trim()
      if (!stdout) {
        throw new Error('R returned an empty response.')
      }

      let payload
      try {
        payload = JSON.parse(stdout)
      } catch {
        const preview = stdout.length > 280 ? `${stdout.slice(0, 277)}...` : stdout
        throw new Error(`R returned invalid JSON. ${preview}`)
      }

      return {
        command,
        rows: normalizeBestHyperparameterRows(payload?.rows),
        workbookGenerated: Boolean(payload?.workbookGenerated),
        workbookMessage:
          typeof payload?.workbookMessage === 'string' ? payload.workbookMessage.trim() : '',
      }
    }

    throw new Error(
      hasSpawnedAnyCommand
        ? lastError instanceof Error
          ? lastError.message
          : `Failed to run Rscript for ${BEST_HYPERPARAMETER_FILE_NAME}.`
        : `Rscript was not found. Install R and add Rscript to PATH, or set RSCRIPT_PATH / R_HOME for backend.`,
    )
  } finally {
    await fsPromises.rm(tempScriptPath, { force: true }).catch(() => {})
  }
}

const runAccuracyPerformanceAnalysis = async ({
  modelFilePath,
  dataTrainPath,
  dataTestPath,
  algorithm,
}) => {
  const rScript = String.raw`args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 5) {
  stop("Expected model, data_train, data_test, plot, and algorithm paths.")
}

model_path <- normalizePath(args[[1]], winslash = "/", mustWork = TRUE)
data_train_path <- normalizePath(args[[2]], winslash = "/", mustWork = TRUE)
data_test_path <- normalizePath(args[[3]], winslash = "/", mustWork = TRUE)
plot_path <- normalizePath(args[[4]], winslash = "/", mustWork = FALSE)
algorithm <- trimws(args[[5]])
dir.create(dirname(plot_path), recursive = TRUE, showWarnings = FALSE)

suppressPackageStartupMessages({
  library(tidymodels)
  library(dplyr)
  library(ggplot2)
  library(rio)
  library(tibble)
})

if (!nzchar(algorithm)) {
  stop("algorithm is required.")
}

ml_results <- readRDS(model_path)
data_train <- rio::import(data_train_path)
data_test <- rio::import(data_test_path)
outcome <- "Peak_acceleration"

if (!outcome %in% names(data_train)) {
  stop("data_train does not contain outcome column: Peak_acceleration")
}
if (!outcome %in% names(data_test)) {
  stop("data_test does not contain outcome column: Peak_acceleration")
}

plot_reg_fit_combined <- function(ml_results, algorithm, data_train, data_test, outcome) {
  res_mid <- ml_results %>%
    extract_workflow_set_result(algorithm)

  best_params <- select_best(res_mid, metric = "rsq")

  final_model_reg <- ml_results %>%
    extract_workflow(algorithm) %>%
    finalize_workflow(best_params) %>%
    fit(data = data_train)

  train_result_reg <- bind_cols(
    tibble(!!outcome := data_train[[outcome]]),
    predict(final_model_reg, data_train)
  ) %>%
    mutate(set = "Training")

  regression_model_train_reg <- stats::lm(stats::reformulate(".pred", response = outcome), data = train_result_reg)
  r2_train <- summary(regression_model_train_reg)$r.squared
  rmse_train <- yardstick::rmse_vec(truth = train_result_reg[[outcome]], estimate = train_result_reg$.pred)

  test_result_reg <- bind_cols(
    tibble(!!outcome := data_test[[outcome]]),
    predict(final_model_reg, data_test)
  ) %>%
    mutate(set = "Testing")

  regression_model_test_reg <- stats::lm(stats::reformulate(".pred", response = outcome), data = test_result_reg)
  r2_test <- summary(regression_model_test_reg)$r.squared
  rmse_test <- yardstick::rmse_vec(truth = test_result_reg[[outcome]], estimate = test_result_reg$.pred)

  all_result_reg <- bind_rows(train_result_reg, test_result_reg)
  plot_values <- c(all_result_reg[[outcome]], all_result_reg$.pred)
  limit_min <- min(plot_values, na.rm = TRUE)
  limit_max <- max(plot_values, na.rm = TRUE)
  span <- limit_max - limit_min
  if (!is.finite(span) || span <= 0) {
    span <- 1
  }
  padding <- span * 0.05
  x_min <- limit_min - padding
  x_max <- limit_max + padding

  font_family <- "Arial"
  plot <- ggplot(all_result_reg, aes(x = .data[[outcome]], y = .pred, color = set)) +
    geom_abline(slope = 1, intercept = 0, linetype = "dashed", color = "#7c7575") +
    geom_point(aes(shape = set), size = 1.8, alpha = 0.72) +
    scale_shape_manual(values = c("Training" = 16, "Testing" = 17)) +
    geom_smooth(method = lm, se = TRUE, linewidth = 0.65) +
    scale_color_manual(values = c("Training" = "#25B677", "Testing" = "#3794E9")) +
    theme_bw(base_size = 13) +
    annotate(
      "text",
      x = x_min + span * 0.02,
      y = x_max - span * 0.01,
      label = algorithm,
      hjust = 0,
      vjust = 1,
      fontface = "bold",
      size = 5,
      color = "#3A393B"
    ) +
    theme(
      legend.position = "none",
      text = element_text(family = font_family),
      plot.title = element_text(size = 12, face = "bold"),
      axis.title = element_text(size = 15, face = "bold"),
      axis.text = element_text(face = "bold", size = 11)
    ) +
    labs(
      x = "Simulated peak acceleration (g)",
      y = "Predicted peak acceleration (g)"
    ) +
    scale_x_continuous(limits = c(x_min, x_max)) +
    scale_y_continuous(limits = c(x_min, x_max))

  ggplot2::ggsave(filename = plot_path, plot = plot, width = 7.2, height = 5.2, dpi = 180, bg = "white")

  list(
    r2_train = as.numeric(r2_train),
    rmse_train = as.numeric(rmse_train),
    r2_test = as.numeric(r2_test),
    rmse_test = as.numeric(rmse_test),
    plot_generated = file.exists(plot_path)
  )
}

result <- plot_reg_fit_combined(ml_results, algorithm, data_train, data_test, outcome)

cat(jsonlite::toJSON(result, auto_unbox = TRUE, na = "null"))
`

  const tempDirPath = path.join(__dirname, '.tmp')
  const tempScriptPath = path.join(
    tempDirPath,
    `generate-accuracy-performance-${process.pid}-${Date.now()}.R`,
  )
  const tempPlotPath = path.join(
    tempDirPath,
    `accuracy-performance-${process.pid}-${Date.now()}.png`,
  )

  await ensureDir(tempDirPath)
  await fsPromises.writeFile(tempScriptPath, rScript, 'utf8')

  const commandCandidates = getRscriptCommandCandidates()
  let lastError = null
  let hasSpawnedAnyCommand = false

  try {
    for (const command of commandCandidates) {
      const result = spawnSync(command, [tempScriptPath, modelFilePath, dataTrainPath, dataTestPath, tempPlotPath, algorithm], {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 12 * 1024 * 1024,
      })

      if (result.error) {
        lastError = result.error
        if (result.error.code === 'ENOENT') {
          continue
        }

        throw result.error
      }

      hasSpawnedAnyCommand = true

      if (typeof result.status !== 'number' || result.status !== 0) {
        const message = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
        throw new Error(message || 'Failed to generate accuracy performance results.')
      }

      const stdout = result.stdout.trim()
      if (!stdout) {
        throw new Error('R returned an empty response.')
      }

      let payload
      try {
        payload = JSON.parse(stdout)
      } catch {
        const preview = stdout.length > 280 ? `${stdout.slice(0, 277)}...` : stdout
        throw new Error(`R returned invalid JSON. ${preview}`)
      }

      const metrics = {
        r2Train: Number(payload?.r2_train),
        rmseTrain: Number(payload?.rmse_train),
        r2Test: Number(payload?.r2_test),
        rmseTest: Number(payload?.rmse_test),
      }

      if (!Object.values(metrics).every((value) => Number.isFinite(value))) {
        throw new Error('R returned invalid accuracy metrics.')
      }

      const chartDataUrl =
        Boolean(payload?.plot_generated) && (await pathExists(tempPlotPath))
          ? `data:image/png;base64,${(await fsPromises.readFile(tempPlotPath)).toString('base64')}`
          : ''

      return {
        command,
        metrics,
        chartDataUrl,
      }
    }

    throw new Error(
      hasSpawnedAnyCommand
        ? lastError instanceof Error
          ? lastError.message
          : 'Failed to run Rscript for accuracy performance.'
        : `Rscript was not found. Install R and add Rscript to PATH, or set RSCRIPT_PATH / R_HOME for backend.`,
    )
  } finally {
    await fsPromises.rm(tempScriptPath, { force: true }).catch(() => {})
    await fsPromises.rm(tempPlotPath, { force: true }).catch(() => {})
  }
}

const resolveType = (rawType) => {
  const productType = ensureValidName(rawType, 'productType')
  return {
    productType,
    typePath: path.join(DATABASE_ROOT, productType),
  }
}

const resolveProductFolder = (rawType, rawName) => {
  const { productType, typePath } = resolveType(rawType)
  const productName = ensureValidName(rawName, 'productName')
  return {
    productType,
    productName,
    typePath,
    productPath: path.join(typePath, productName),
  }
}

const resolveVersionFolder = (rawType, rawName, rawVersion) => {
  const { productType, productName, typePath, productPath } = resolveProductFolder(rawType, rawName)
  const modelVersion = ensureValidName(rawVersion, 'modelVersion')
  return {
    productType,
    productName,
    modelVersion,
    typePath,
    productPath,
    versionPath: path.join(productPath, modelVersion),
  }
}

const deleteProductTypeFolder = async (rawType) => {
  const { productType, typePath } = resolveType(rawType)
  if (!(await pathExists(typePath))) {
    const error = new Error('Product type not found.')
    error.statusCode = 404
    throw error
  }

  await fsPromises.rm(typePath, { recursive: true, force: false })
  return {
    productType,
    sourcePath: toTypeSourcePath(productType),
  }
}

const deleteProductFolder = async (rawType, rawName) => {
  const { productType, productName, productPath } = resolveProductFolder(rawType, rawName)
  if (!(await pathExists(productPath))) {
    const error = new Error('Product name not found.')
    error.statusCode = 404
    throw error
  }

  await fsPromises.rm(productPath, { recursive: true, force: false })
  return {
    productType,
    folderId: toFolderId(productType, productName),
    folderName: productName,
    sourcePath: toFolderSourcePath(productType, productName),
  }
}

const listProductModels = async (productType, productName, productPath) => {
  if (!(await pathExists(productPath))) {
    return []
  }

  const activeModel = await resolveValidActiveModel(productPath)
  const activeModelIdentity = activeModel ? toModelIdentity(activeModel.version, activeModel.fileName) : ''
  const entries = await fsPromises.readdir(productPath, { withFileTypes: true })
  const modelsWithMeta = []

  const appendModelRecord = async (modelVersion, versionPath, sourcePath) => {
    const { primaryFileName, allModelFileName, finalModelFileName } = await readVersionModelFiles(versionPath)
    if (!primaryFileName) {
      return
    }

    const primaryFilePath = path.join(versionPath, primaryFileName)
    const stat = await fsPromises.stat(primaryFilePath)
    const identity = toModelIdentity(modelVersion, primaryFileName)
    modelsWithMeta.push({
      version: modelVersion,
      fileName: primaryFileName,
      allModelFileName: allModelFileName || primaryFileName,
      finalModelFileName,
      uploadedAt: formatDateTime(stat.mtime),
      sourcePath: `${sourcePath}/${encodeURIComponent(primaryFileName)}`,
      isActive: identity === activeModelIdentity,
      mtimeMs: stat.mtimeMs,
    })
  }

  await appendModelRecord(
    UNVERSIONED_MODEL_LABEL,
    productPath,
    toFolderSourcePath(productType, productName),
  )

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(productPath, entry.name)
      if (!entry.isDirectory()) {
        return
      }

      await appendModelRecord(entry.name, entryPath, toVersionSourcePath(productType, productName, entry.name))
    }),
  )

  return modelsWithMeta.sort((left, right) => right.mtimeMs - left.mtimeMs)
}

const listProductFolders = async (productType) => {
  const { productType: normalizedType, typePath } = resolveType(productType)
  if (!(await pathExists(typePath))) {
    return []
  }

  const entries = await fsPromises.readdir(typePath, { withFileTypes: true })
  const foldersWithMeta = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const folderPath = path.join(typePath, entry.name)
        const stat = await fsPromises.stat(folderPath)
        const models = await listProductModels(normalizedType, entry.name, folderPath)
        return {
          folderId: toFolderId(normalizedType, entry.name),
          folderName: entry.name,
          sourcePath: toFolderSourcePath(normalizedType, entry.name),
          uploadedAt: models[0]?.uploadedAt ?? formatDateTime(stat.mtime),
          files: models.map((model) =>
            model.version === UNVERSIONED_MODEL_LABEL ? model.fileName : `${model.version}/${model.fileName}`,
          ),
          models: models.map(({ mtimeMs, ...model }) => model),
          mtimeMs: models[0]?.mtimeMs ?? stat.mtimeMs,
        }
      }),
  )

  return foldersWithMeta
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map(({ mtimeMs, ...folder }) => folder)
}

const deleteModelVersion = async (rawType, rawName, rawVersion) => {
  const { productType, productName, productPath } = resolveProductFolder(rawType, rawName)
  const requestedVersion = String(rawVersion ?? '').trim()
  if (!requestedVersion) {
    throw new Error('modelVersion is invalid.')
  }

  let modelVersion = requestedVersion
  let versionPath = ''
  let versionSourcePath = ''

  if (requestedVersion === UNVERSIONED_MODEL_LABEL) {
    versionSourcePath = toFolderSourcePath(productType, productName)
  } else {
    const resolvedVersion = resolveVersionFolder(productType, productName, requestedVersion)
    modelVersion = resolvedVersion.modelVersion
    versionPath = resolvedVersion.versionPath
    versionSourcePath = toVersionSourcePath(productType, productName, modelVersion)
  }

  const activeModel = await resolveValidActiveModel(productPath)
  const isDeletingFromActiveVersion = activeModel ? activeModel.version === modelVersion : false

  if (versionPath) {
    if (!(await pathExists(versionPath))) {
      const error = new Error('Model version folder not found.')
      error.statusCode = 404
      throw error
    }

    await fsPromises.rm(versionPath, { recursive: true, force: true })
  } else {
    const rootEntries = await fsPromises.readdir(productPath, { withFileTypes: true })
    const rootFiles = rootEntries.filter((entry) => entry.isFile() && entry.name !== DEPLOYMENT_META_FILE)
    if (rootFiles.length === 0) {
      const error = new Error('Model version folder not found.')
      error.statusCode = 404
      throw error
    }

    await Promise.all(rootFiles.map((entry) => fsPromises.unlink(path.join(productPath, entry.name))))
  }

  if (isDeletingFromActiveVersion) {
    await writeDeploymentMeta(productPath, null)
  }

  return {
    productType,
    folderId: toFolderId(productType, productName),
    folderName: productName,
    modelVersion,
    deletedVersionName: modelVersion,
    sourcePath: versionSourcePath,
  }
}

const activateModel = async (rawType, rawName, rawVersion, _rawFileName) => {
  const { productType, productName, productPath } = resolveProductFolder(rawType, rawName)
  const requestedVersion = String(rawVersion ?? '').trim()
  if (!requestedVersion) {
    throw new Error('modelVersion is invalid.')
  }

  const modelVersion =
    requestedVersion === UNVERSIONED_MODEL_LABEL
      ? UNVERSIONED_MODEL_LABEL
      : resolveVersionFolder(productType, productName, requestedVersion).modelVersion
  const fileName = await resolveVersionModelFileName(productPath, modelVersion)

  if (!fileName) {
    const error = new Error('No deployable model file was found in this version folder.')
    error.statusCode = 404
    throw error
  }

  const activatedAt = formatDateTime(new Date())
  await writeDeploymentMeta(productPath, {
    version: modelVersion,
    activatedAt,
  })

  return {
    productType,
    folderId: toFolderId(productType, productName),
    folderName: productName,
    modelVersion,
    fileName,
    activatedAt,
    sourcePath: toFolderSourcePath(productType, productName),
  }
}

app.use(cors())
app.use(express.json())

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = ensureValidEmail(req.body?.email)
    const password = ensureValidPassword(req.body?.password)
    const users = await readAuthUsers()
    if (users.some((user) => user.email === email)) {
      res.status(409).json({
        message: 'An account with this email already exists.',
      })
      return
    }

    const user = createAuthUserRecord({
      email,
      password,
      role: users.length === 0 ? AUTH_ROLE_ADMIN : AUTH_ROLE_USER,
    })
    const nextUsers = [...users, user]
    ensureAtLeastOneActiveAdministrator(nextUsers)
    await writeJsonArrayFile(AUTH_USERS_FILE_PATH, nextUsers)

    const session = await createSessionForUser(user.id)
    res.status(201).json({
      token: session.token,
      user: sanitizeAuthUser(user),
      message: 'Registered successfully.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to register.',
    })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = ensureValidEmail(req.body?.email)
    const password = String(req.body?.password ?? '')
    if (!password) {
      throw new Error('Password is required.')
    }

    const users = await readAuthUsers()
    const user = users.find((entry) => entry.email === email)
    if (!user || !verifyPasswordHash(password, user.passwordHash)) {
      res.status(401).json({
        message: 'Incorrect email or password.',
      })
      return
    }

    const accessState = getAuthUserAccessState(user)
    if (accessState !== AUTH_STATUS_ACTIVE) {
      await removeSessionsForUser(user.id)
      res.status(403).json({
        message: accessState === AUTH_STATUS_DISABLED ? 'This account is disabled.' : 'This account has expired.',
      })
      return
    }

    const session = await createSessionForUser(user.id)
    res.json({
      token: session.token,
      user: sanitizeAuthUser(user),
      message: 'Signed in.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to sign in.',
    })
  }
})

app.get('/api/auth/session', async (req, res) => {
  try {
    const authenticated = await resolveAuthenticatedUser(readBearerToken(req))
    if (!authenticated) {
      res.status(401).json({
        message: 'Session is invalid or expired.',
      })
      return
    }

    res.json({
      user: sanitizeAuthUser(authenticated.user),
    })
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to load session.',
    })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = readBearerToken(req)
    if (token) {
      await removeSessionByToken(token)
    }

    res.json({
      message: 'Signed out.',
    })
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to sign out.',
    })
  }
})

app.use('/api', async (req, res, next) => {
  try {
    const requestPath = `${req.baseUrl ?? ''}${req.path ?? ''}`
    if (requestPath === '/api/health' || requestPath === '/api/auth' || requestPath.startsWith('/api/auth/')) {
      next()
      return
    }

    const authenticated = await resolveAuthenticatedUser(readBearerToken(req))
    if (!authenticated) {
      res.status(401).json({
        message: 'Authentication required.',
      })
      return
    }

    req.authUser = sanitizeAuthUser(authenticated.user)
    next()
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to authenticate request.',
    })
  }
})

app.use('/api/account', ensureAdminRequest)
app.use('/api/library', ensureFeatureRequest(AUTH_PERMISSION_LIBRARY))
app.use('/api/explore', ensureFeatureRequest(AUTH_PERMISSION_EXPLORE))
app.use('/api/projects', ensureFeatureRequest(AUTH_PERMISSION_NEW_TASK))
app.use('/api/new-task', ensureFeatureRequest(AUTH_PERMISSION_NEW_TASK))

app.get('/api/account/users', async (_req, res) => {
  try {
    const users = await readAuthUsers()
    const sortedUsers = [...users].sort((left, right) => {
      const leftRoleRank = left.role === AUTH_ROLE_ADMIN ? 0 : 1
      const rightRoleRank = right.role === AUTH_ROLE_ADMIN ? 0 : 1
      if (leftRoleRank !== rightRoleRank) {
        return leftRoleRank - rightRoleRank
      }

      const leftAccessRank = getAuthUserAccessState(left) === AUTH_STATUS_ACTIVE ? 0 : 1
      const rightAccessRank = getAuthUserAccessState(right) === AUTH_STATUS_ACTIVE ? 0 : 1
      if (leftAccessRank !== rightAccessRank) {
        return leftAccessRank - rightAccessRank
      }

      return String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''))
    })

    res.json({
      users: sortedUsers.map((user) => sanitizeAuthUser(user)),
    })
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to load users.',
    })
  }
})

app.post('/api/account/users', async (req, res) => {
  try {
    const users = await readAuthUsers()
    const email = ensureValidEmail(req.body?.email)
    const password = ensureValidPassword(req.body?.password)
    const role = normalizeAuthRole(req.body?.role, AUTH_ROLE_USER)
    const status = normalizeAuthStatus(req.body?.status, AUTH_STATUS_ACTIVE)
    const permissions = normalizeAuthPermissions(req.body?.permissions)
    const username = normalizeUsername(req.body?.username, email)

    if (users.some((user) => user.email === email)) {
      res.status(409).json({
        message: 'An account with this email already exists.',
      })
      return
    }

    if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({
        message: 'This username is already in use.',
      })
      return
    }

    const user = createAuthUserRecord({
      email,
      password,
      role,
      status,
      permissions,
      displayName: req.body?.displayName,
      username,
      phone: req.body?.phone,
      organization: req.body?.organization,
      expiresAt: req.body?.expiresAt,
    })

    const nextUsers = [...users, user]
    ensureAtLeastOneActiveAdministrator(nextUsers)
    await writeJsonArrayFile(AUTH_USERS_FILE_PATH, nextUsers)

    res.status(201).json({
      user: sanitizeAuthUser(user),
      message: 'User created.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to create user.',
    })
  }
})

app.patch('/api/account/users/:userId', async (req, res) => {
  try {
    const userId = String(req.params?.userId ?? '').trim()
    const users = await readAuthUsers()
    const userIndex = users.findIndex((user) => user.id === userId)
    if (userIndex === -1) {
      res.status(404).json({
        message: 'User not found.',
      })
      return
    }

    const currentUserRecord = users[userIndex]
    const hasField = (fieldName) => Object.prototype.hasOwnProperty.call(req.body ?? {}, fieldName)
    const nextEmail = hasField('email') ? ensureValidEmail(req.body?.email) : currentUserRecord.email
    const nextRole = hasField('role') ? normalizeAuthRole(req.body?.role, currentUserRecord.role) : currentUserRecord.role
    const nextStatus = hasField('status')
      ? normalizeAuthStatus(req.body?.status, currentUserRecord.status)
      : currentUserRecord.status
    const nextUsername = hasField('username')
      ? normalizeUsername(req.body?.username, nextEmail)
      : currentUserRecord.username

    if (currentUserRecord.id === req.authUser.id && nextRole !== currentUserRecord.role) {
      res.status(400).json({
        message: 'You cannot change your own role from this panel.',
      })
      return
    }

    if (currentUserRecord.id === req.authUser.id && nextStatus === AUTH_STATUS_DISABLED) {
      res.status(400).json({
        message: 'You cannot disable your own account.',
      })
      return
    }

    if (users.some((user) => user.id !== currentUserRecord.id && user.email === nextEmail)) {
      res.status(409).json({
        message: 'An account with this email already exists.',
      })
      return
    }

    if (users.some((user) => user.id !== currentUserRecord.id && user.username.toLowerCase() === nextUsername.toLowerCase())) {
      res.status(409).json({
        message: 'This username is already in use.',
      })
      return
    }

    const nextUser = {
      ...currentUserRecord,
      email: nextEmail,
      updatedAt: new Date().toISOString(),
      displayName: hasField('displayName')
        ? normalizeDisplayName(req.body?.displayName, nextEmail)
        : currentUserRecord.displayName,
      username: nextUsername,
      phone: hasField('phone') ? normalizeOptionalPhone(req.body?.phone) : currentUserRecord.phone,
      organization: hasField('organization')
        ? normalizeOptionalOrganization(req.body?.organization)
        : currentUserRecord.organization,
      expiresAt: hasField('expiresAt')
        ? normalizeOptionalDateValue(req.body?.expiresAt)
        : currentUserRecord.expiresAt,
      role: nextRole,
      status: nextStatus,
      permissions: hasField('permissions')
        ? normalizeAuthPermissions(req.body?.permissions, currentUserRecord.permissions)
        : currentUserRecord.permissions,
    }

    const nextUsers = [...users]
    nextUsers[userIndex] = nextUser
    ensureAtLeastOneActiveAdministrator(nextUsers)
    await writeJsonArrayFile(AUTH_USERS_FILE_PATH, nextUsers)

    if (getAuthUserAccessState(nextUser) !== AUTH_STATUS_ACTIVE) {
      await removeSessionsForUser(nextUser.id)
    }

    res.json({
      user: sanitizeAuthUser(nextUser),
      message: 'User updated.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to update user.',
    })
  }
})

app.post('/api/account/users/:userId/reset-password', async (req, res) => {
  try {
    const userId = String(req.params?.userId ?? '').trim()
    const password = ensureValidPassword(req.body?.password)
    const users = await readAuthUsers()
    const userIndex = users.findIndex((user) => user.id === userId)
    if (userIndex === -1) {
      res.status(404).json({
        message: 'User not found.',
      })
      return
    }

    const updatedAt = new Date().toISOString()
    const nextUser = {
      ...users[userIndex],
      passwordHash: createPasswordHash(password),
      updatedAt,
      passwordUpdatedAt: updatedAt,
    }

    const nextUsers = [...users]
    nextUsers[userIndex] = nextUser
    await writeJsonArrayFile(AUTH_USERS_FILE_PATH, nextUsers)

    await removeSessionsForUser(nextUser.id, {
      exceptToken: nextUser.id === req.authUser.id ? readBearerToken(req) : '',
    })

    res.json({
      user: sanitizeAuthUser(nextUser),
      message: 'Password reset.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to reset password.',
    })
  }
})

app.delete('/api/account/users/:userId', async (req, res) => {
  try {
    const userId = String(req.params?.userId ?? '').trim()
    if (userId === req.authUser.id) {
      res.status(400).json({
        message: 'You cannot delete your own account.',
      })
      return
    }

    const users = await readAuthUsers()
    const existingUser = users.find((user) => user.id === userId)
    if (!existingUser) {
      res.status(404).json({
        message: 'User not found.',
      })
      return
    }

    const nextUsers = users.filter((user) => user.id !== userId)
    ensureAtLeastOneActiveAdministrator(nextUsers)
    await writeJsonArrayFile(AUTH_USERS_FILE_PATH, nextUsers)
    await removeSessionsForUser(userId)

    res.json({
      message: 'User deleted.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to delete user.',
    })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/library/product-types', async (_req, res) => {
  try {
    await ensureDir(DATABASE_ROOT)
    const entries = await fsPromises.readdir(DATABASE_ROOT, { withFileTypes: true })
    const productTypes = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))

    res.json({ productTypes })
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to list product types.',
    })
  }
})

app.post('/api/library/product-types', async (req, res) => {
  try {
    const { productType, typePath } = resolveType(req.body.productType)
    const existed = await pathExists(typePath)
    await ensureDir(typePath)

    res.status(existed ? 200 : 201).json({
      productType,
      sourcePath: toTypeSourcePath(productType),
      created: !existed,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to create product type.',
    })
  }
})

app.delete('/api/library/product-types', async (req, res) => {
  try {
    const payload = await deleteProductTypeFolder(req.body.productType)
    res.json(payload)
  } catch (error) {
    const statusCode = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 400
    res.status(statusCode).json({
      message: error instanceof Error ? error.message : 'Failed to delete product type.',
    })
  }
})

app.get('/api/library/products', async (req, res) => {
  try {
    const productType = String(req.query.productType ?? '')
    const normalizedType = ensureValidName(productType, 'productType')
    const folders = await listProductFolders(normalizedType)
    res.json({
      productType: normalizedType,
      folders,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to list products.',
    })
  }
})

app.get('/api/library/folders', async (req, res) => {
  try {
    const productType = String(req.query.productType ?? '')
    const normalizedType = ensureValidName(productType, 'productType')
    const folders = await listProductFolders(normalizedType)
    res.json({
      productType: normalizedType,
      folders,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to list folders.',
    })
  }
})

app.post('/api/library/products', async (req, res) => {
  try {
    const { productType, productName, typePath, productPath } = resolveProductFolder(
      req.body.productType,
      req.body.productName,
    )
    const existed = await pathExists(productPath)
    await ensureDir(typePath)
    await ensureDir(productPath)
    const stat = await fsPromises.stat(productPath)

    res.status(existed ? 200 : 201).json({
      productType,
      folderId: toFolderId(productType, productName),
      folderName: productName,
      sourcePath: toFolderSourcePath(productType, productName),
      uploadedAt: formatDateTime(stat.mtime),
      created: !existed,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to create product folder.',
    })
  }
})

app.delete('/api/library/products', async (req, res) => {
  try {
    const payload = await deleteProductFolder(req.body.productType, req.body.productName)
    res.json(payload)
  } catch (error) {
    const statusCode = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 400
    res.status(statusCode).json({
      message: error instanceof Error ? error.message : 'Failed to delete product folder.',
    })
  }
})

app.post(
  '/api/library/upload-model',
  upload.fields([
    { name: 'modelFile', maxCount: 1 },
    { name: 'finalModelFile', maxCount: 1 },
    { name: 'dataTrainFile', maxCount: 1 },
    { name: 'dataTestFile', maxCount: 1 },
    { name: 'validationFile', maxCount: 1 },
    { name: 'bestHyperparameterFile', maxCount: 1 },
  ]),
  async (req, res) => {
  try {
    const { productType, productName, modelVersion, typePath, productPath, versionPath } = resolveVersionFolder(
      req.body.productType,
      req.body.productName,
      req.body.modelVersion,
    )

    const modelFile = Array.isArray(req.files?.modelFile) ? req.files.modelFile[0] : null
    const finalModelFile = Array.isArray(req.files?.finalModelFile) ? req.files.finalModelFile[0] : null
    const dataTrainFile = Array.isArray(req.files?.dataTrainFile) ? req.files.dataTrainFile[0] : null
    const dataTestFile = Array.isArray(req.files?.dataTestFile) ? req.files.dataTestFile[0] : null
    const validationFile = Array.isArray(req.files?.validationFile) ? req.files.validationFile[0] : null
    const bestHyperparameterFile = Array.isArray(req.files?.bestHyperparameterFile)
      ? req.files.bestHyperparameterFile[0]
      : null

    if (!modelFile) {
      res.status(400).json({ message: 'modelFile is required.' })
      return
    }
    if (!finalModelFile) {
      res.status(400).json({ message: 'finalModelFile is required.' })
      return
    }
    if (!dataTrainFile) {
      res.status(400).json({ message: 'dataTrainFile is required.' })
      return
    }
    if (!dataTestFile) {
      res.status(400).json({ message: 'dataTestFile is required.' })
      return
    }

    const ensureValidRdsUpload = (file, label) => {
      const safeFileName = sanitizeFileName(file?.originalname || `${label}${MODEL_FILE_EXTENSION}`)
      if (!safeFileName) {
        throw new Error(`Invalid ${label} name.`)
      }
      if (!hasExtension(safeFileName, MODEL_FILE_EXTENSION)) {
        throw new Error(`${label} must use ${MODEL_FILE_EXTENSION}.`)
      }
    }

    const ensureValidDataAttachment = (file, label) => {
      if (!file) {
        return
      }

      const safeDataFileName = sanitizeFileName(file.originalname || label)
      if (!safeDataFileName) {
        throw new Error(`Invalid ${label} name.`)
      }

      const extension = getFileExtension(safeDataFileName)
      if (!extension || !ALLOWED_DATA_FILE_EXTENSIONS.has(extension)) {
        throw new Error(`${label} must use one of: ${Array.from(ALLOWED_DATA_FILE_EXTENSIONS).join(', ')}.`)
      }
    }

    ensureValidRdsUpload(modelFile, 'All model file')
    ensureValidRdsUpload(finalModelFile, 'Final model file')
    ensureValidDataAttachment(dataTrainFile, 'Data train file')
    ensureValidDataAttachment(dataTestFile, 'Data test file')

    if (validationFile) {
      const safeValidationName = sanitizeFileName(validationFile.originalname || VALIDATION_ACCURACY_FILE_NAME)
      if (!safeValidationName) {
        res.status(400).json({ message: 'Invalid validation file name.' })
        return
      }
      if (!hasExtension(safeValidationName, VALIDATION_FILE_EXTENSION)) {
        res.status(400).json({ message: `Validation file must use ${VALIDATION_FILE_EXTENSION}.` })
        return
      }
    }

    if (bestHyperparameterFile) {
      const safeBestHyperparameterName = sanitizeFileName(
        bestHyperparameterFile.originalname || BEST_HYPERPARAMETER_FILE_NAME,
      )
      if (!safeBestHyperparameterName) {
        res.status(400).json({ message: 'Invalid best hyper-parameter file name.' })
        return
      }
      if (!hasExtension(safeBestHyperparameterName, VALIDATION_FILE_EXTENSION)) {
        res.status(400).json({
          message: `Best hyper-parameter file must use ${VALIDATION_FILE_EXTENSION}.`,
        })
        return
      }
    }

    await ensureDir(typePath)
    await ensureDir(productPath)
    await ensureDir(versionPath)

    const finalName = buildDeployedModelFileName(productName, modelVersion)
    const targetPath = path.join(versionPath, finalName)
    await fsPromises.writeFile(targetPath, finalModelFile.buffer)

    const allModelFileName = buildAllModelFileName(productName, modelVersion)
    const allModelPath = path.join(versionPath, allModelFileName)
    await fsPromises.writeFile(allModelPath, modelFile.buffer)

    const dataTrainFileName = dataTrainFile
      ? buildVersionAttachmentFileName(productName, modelVersion, DATA_TRAIN_FILE_BASENAME, dataTrainFile.originalname)
      : undefined
    const dataTestFileName = dataTestFile
      ? buildVersionAttachmentFileName(productName, modelVersion, DATA_TEST_FILE_BASENAME, dataTestFile.originalname)
      : undefined

    if (dataTrainFile && dataTrainFileName) {
      const dataTrainPath = path.join(versionPath, dataTrainFileName)
      await fsPromises.writeFile(dataTrainPath, dataTrainFile.buffer)
    }

    if (dataTestFile && dataTestFileName) {
      const dataTestPath = path.join(versionPath, dataTestFileName)
      await fsPromises.writeFile(dataTestPath, dataTestFile.buffer)
    }

    if (validationFile) {
      const validationPath = path.join(versionPath, VALIDATION_ACCURACY_FILE_NAME)
      await fsPromises.writeFile(validationPath, validationFile.buffer)
    }

    if (bestHyperparameterFile) {
      const bestHyperparameterPath = path.join(versionPath, BEST_HYPERPARAMETER_FILE_NAME)
      await fsPromises.writeFile(bestHyperparameterPath, bestHyperparameterFile.buffer)
    }

    res.status(201).json({
      productType,
      folderId: toFolderId(productType, productName),
      folderName: productName,
      sourcePath: toVersionSourcePath(productType, productName, modelVersion),
      uploadedAt: formatDateTime(new Date()),
      modelVersion,
      storedFileName: allModelFileName,
      allModelFileName,
      trainModelFileName: allModelFileName,
      finalModelFileName: finalName,
      dataTrainFileName,
      dataTestFileName,
      validationFileName: validationFile ? VALIDATION_ACCURACY_FILE_NAME : undefined,
      bestHyperparameterFileName: bestHyperparameterFile ? BEST_HYPERPARAMETER_FILE_NAME : undefined,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to upload model file.',
    })
  }
})

app.delete('/api/library/models', async (req, res) => {
  try {
    const payload = await deleteModelVersion(req.body.productType, req.body.productName, req.body.modelVersion)
    res.json(payload)
  } catch (error) {
    const statusCode = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 400
    res.status(statusCode).json({
      message: error instanceof Error ? error.message : 'Failed to delete model version.',
    })
  }
})

app.post('/api/library/models/delete', async (req, res) => {
  try {
    const payload = await deleteModelVersion(req.body.productType, req.body.productName, req.body.modelVersion)
    res.json(payload)
  } catch (error) {
    const statusCode = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 400
    res.status(statusCode).json({
      message: error instanceof Error ? error.message : 'Failed to delete model version.',
    })
  }
})

app.post('/api/library/models/activate', async (req, res) => {
  try {
    const payload = await activateModel(
      req.body.productType,
      req.body.productName,
      req.body.modelVersion,
      req.body.fileName,
    )
    res.json(payload)
  } catch (error) {
    const statusCode = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 400
    res.status(statusCode).json({
      message: error instanceof Error ? error.message : 'Failed to activate model version.',
    })
  }
})

app.post('/api/library/model/activate', async (req, res) => {
  try {
    const payload = await activateModel(
      req.body.productType,
      req.body.productName,
      req.body.modelVersion,
      req.body.fileName,
    )
    res.json(payload)
  } catch (error) {
    const statusCode = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 400
    res.status(statusCode).json({
      message: error instanceof Error ? error.message : 'Failed to activate model version.',
    })
  }
})

app.get('/api/library/cross-validation-results', async (req, res) => {
  try {
    const productType = ensureValidName(String(req.query.productType ?? ''), 'productType')
    const productName = ensureValidName(String(req.query.productName ?? ''), 'productName')
    const modelVersion = ensureValidName(String(req.query.modelVersion ?? ''), 'modelVersion')
    const fileName = ensureValidFileName(String(req.query.fileName ?? ''))
    if (!hasExtension(fileName, MODEL_FILE_EXTENSION)) {
      throw new Error(`fileName must use ${MODEL_FILE_EXTENSION}.`)
    }
    const { productPath } = resolveProductFolder(productType, productName)
    const targetFilePath = buildModelFilePath(productPath, modelVersion, fileName)
    const workbookPath = buildModelFilePath(productPath, modelVersion, VALIDATION_ACCURACY_FILE_NAME)

    if (!(await pathExists(targetFilePath))) {
      res.status(404).json({ message: 'Model file not found.' })
      return
    }

    if (await pathExists(workbookPath)) {
      const cachedRows = readValidationAccuracyRows(workbookPath)
      if (cachedRows.length > 0) {
        console.log(`[library] Loaded cross-validation results from existing ${VALIDATION_ACCURACY_FILE_NAME}`)
        res.json({
          rows: cachedRows,
        })
        return
      }

      console.warn(`[library] Existing ${VALIDATION_ACCURACY_FILE_NAME} was empty. Recomputing.`)
    }

    const payload = await invokeRPlumber(
      '/validation-accuracy',
      {
        modelPath: targetFilePath,
        outputPath: workbookPath,
      },
      'Failed to load cross-validation results from R plumber service.',
    )
    const rows = normalizeCrossValidationRows(payload?.rows)
    const workbookWritten = Boolean(payload?.workbookGenerated) && (await pathExists(workbookPath))
    const workbookMessage = workbookWritten
      ? ''
      : typeof payload?.workbookMessage === 'string' && payload.workbookMessage.trim()
        ? payload.workbookMessage.trim()
        : `${VALIDATION_ACCURACY_FILE_NAME} was not written to disk.`
    console.log(`[library] Computed cross-validation results via plumber`)
    if (workbookWritten) {
      console.log(`[library] Generated ${VALIDATION_ACCURACY_FILE_NAME} via plumber`)
    } else {
      console.warn(`[library] ${VALIDATION_ACCURACY_FILE_NAME} export skipped: ${workbookMessage}`)
    }

    res.json({
      rows,
      message: !workbookWritten ? `${VALIDATION_ACCURACY_FILE_NAME} export skipped: ${workbookMessage}` : undefined,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to load cross-validation results.',
    })
  }
})

app.get('/api/library/best-hyperparameters', async (req, res) => {
  try {
    const productType = ensureValidName(String(req.query.productType ?? ''), 'productType')
    const productName = ensureValidName(String(req.query.productName ?? ''), 'productName')
    const modelVersion = ensureValidName(String(req.query.modelVersion ?? ''), 'modelVersion')
    const fileName = ensureValidFileName(String(req.query.fileName ?? ''))
    const algorithm = ensureValidName(String(req.query.algorithm ?? ''), 'algorithm')
    if (!hasExtension(fileName, MODEL_FILE_EXTENSION)) {
      throw new Error(`fileName must use ${MODEL_FILE_EXTENSION}.`)
    }

    const { productPath } = resolveProductFolder(productType, productName)
    const targetFilePath = buildModelFilePath(productPath, modelVersion, fileName)
    const workbookPath = buildModelFilePath(productPath, modelVersion, BEST_HYPERPARAMETER_FILE_NAME)
    if (!(await pathExists(targetFilePath))) {
      res.status(404).json({ message: 'Model file not found.' })
      return
    }

    const filterRowsForAlgorithm = (rows) =>
      rows.filter((row) => matchesBestHyperparameterModel(row.model, algorithm))

    if (await pathExists(workbookPath)) {
      const cachedRows = filterRowsForAlgorithm(readBestHyperparameterRows(workbookPath))
      if (cachedRows.length > 0) {
        console.log(`[library] Loaded best hyper-parameters from existing ${BEST_HYPERPARAMETER_FILE_NAME}`)
        res.json({
          model: algorithm,
          rows: cachedRows.map((row) => ({
            hyperparameter: row.hyperparameter,
            value: row.value,
          })),
        })
        return
      }

      console.warn(
        `[library] Existing ${BEST_HYPERPARAMETER_FILE_NAME} did not contain rows for ${algorithm}. Recomputing.`,
      )
    }

    const payload = await invokeRPlumber(
      '/best-hyperparameters',
      {
        modelPath: targetFilePath,
        outputPath: workbookPath,
      },
      'Failed to load best hyper-parameters from R plumber service.',
    )
    const analysisRows = normalizeBestHyperparameterRows(payload?.rows)
    const workbookWritten = Boolean(payload?.workbookGenerated) && (await pathExists(workbookPath))
    const workbookMessage = workbookWritten
      ? ''
      : typeof payload?.workbookMessage === 'string' && payload.workbookMessage.trim()
        ? payload.workbookMessage.trim()
        : `${BEST_HYPERPARAMETER_FILE_NAME} was not written to disk.`
    console.log(`[library] Computed best hyper-parameters via plumber`)
    if (workbookWritten) {
      console.log(`[library] Generated ${BEST_HYPERPARAMETER_FILE_NAME} via plumber`)
    } else {
      console.warn(`[library] ${BEST_HYPERPARAMETER_FILE_NAME} export skipped: ${workbookMessage}`)
    }

    res.json({
      model: algorithm,
      rows: filterRowsForAlgorithm(analysisRows).map((row) => ({
        hyperparameter: row.hyperparameter,
        value: row.value,
      })),
      message: !workbookWritten ? `${BEST_HYPERPARAMETER_FILE_NAME} export skipped: ${workbookMessage}` : undefined,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to load best hyper-parameters.',
    })
  }
})

app.get('/api/library/accuracy-performance', async (req, res) => {
  try {
    const productType = ensureValidName(String(req.query.productType ?? ''), 'productType')
    const productName = ensureValidName(String(req.query.productName ?? ''), 'productName')
    const modelVersion = ensureValidName(String(req.query.modelVersion ?? ''), 'modelVersion')
    const fileName = ensureValidFileName(String(req.query.fileName ?? ''))
    const algorithm = ensureValidName(String(req.query.algorithm ?? ''), 'algorithm')
    if (!hasExtension(fileName, MODEL_FILE_EXTENSION)) {
      throw new Error(`fileName must use ${MODEL_FILE_EXTENSION}.`)
    }

    const { productPath } = resolveProductFolder(productType, productName)
    const targetFilePath = buildModelFilePath(productPath, modelVersion, fileName)
    if (!(await pathExists(targetFilePath))) {
      res.status(404).json({ message: 'Model file not found.' })
      return
    }

    const dataTrainPath = await findVersionAttachmentPath({
      productPath,
      productType,
      productName,
      modelVersion,
      baseNames: DATA_TRAIN_FILE_BASENAME_ALIASES,
      allowedExtensions: ALLOWED_DATA_FILE_EXTENSIONS,
    })
    if (!dataTrainPath) {
      res.status(404).json({ message: 'Data train file not found.' })
      return
    }

    const dataTestPath = await findVersionAttachmentPath({
      productPath,
      productType,
      productName,
      modelVersion,
      baseNames: DATA_TEST_FILE_BASENAME_ALIASES,
      allowedExtensions: ALLOWED_DATA_FILE_EXTENSIONS,
    })
    if (!dataTestPath) {
      res.status(404).json({ message: 'Data test file not found.' })
      return
    }

    const payload = await invokeRPlumber(
      '/accuracy-performance',
      {
        modelPath: targetFilePath,
        dataTrainPath,
        dataTestPath,
        algorithm,
      },
      'Failed to load accuracy performance from R plumber service.',
    )
    const metrics = {
      r2Train: Number(payload?.metrics?.r2Train),
      rmseTrain: Number(payload?.metrics?.rmseTrain),
      r2Test: Number(payload?.metrics?.r2Test),
      rmseTest: Number(payload?.metrics?.rmseTest),
    }
    if (!Object.values(metrics).every((value) => Number.isFinite(value))) {
      throw new Error('R plumber service returned invalid accuracy metrics.')
    }
    const points = normalizeAccuracyChartPoints(payload?.points)

    let chartDataUrl = ''
    const plotPath =
      typeof payload?.plotPath === 'string' && payload.plotPath.trim() ? payload.plotPath.trim() : ''
    if (Boolean(payload?.plotGenerated) && plotPath && (await pathExists(plotPath))) {
      chartDataUrl = `data:image/png;base64,${(await fsPromises.readFile(plotPath)).toString('base64')}`
      await fsPromises.rm(plotPath, { force: true }).catch(() => {})
    }

    console.log(`[library] Computed accuracy performance for ${algorithm} via plumber`)
    res.json({
      algorithm,
      metrics,
      points,
      chartDataUrl,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to load accuracy performance.',
    })
  }
})

app.get('/api/explore/active-products', async (_req, res) => {
  try {
    await ensureDir(DATABASE_ROOT)
    const entries = await fsPromises.readdir(DATABASE_ROOT, { withFileTypes: true })
    const productTypes = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))

    const folderGroups = await Promise.all(
      productTypes.map(async (productType) => ({
        productType,
        folders: await listProductFolders(productType),
      })),
    )
    const items = folderGroups
      .flatMap(({ productType, folders }) =>
        folders
          .map((folder) => {
            const activeModel = Array.isArray(folder.models) ? folder.models.find((model) => model.isActive) : null
            if (!activeModel) {
              return null
            }

            return {
              productType,
              productName: String(folder.folderName ?? '').trim(),
              folderId: String(folder.folderId ?? '').trim(),
              activeModel: {
                version: String(activeModel.version ?? '').trim(),
                fileName: String(activeModel.fileName ?? '').trim(),
                finalModelFileName: String(activeModel.finalModelFileName ?? '').trim(),
                uploadedAt: String(activeModel.uploadedAt ?? '').trim(),
              },
            }
          })
          .filter((item) => item !== null),
      )
      .sort(
        (left, right) =>
          left.productType.localeCompare(right.productType) || left.productName.localeCompare(right.productName),
      )

    res.json({
      productTypes: Array.from(new Set(items.map((item) => item.productType))),
      items,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to load active Explore products.',
    })
  }
})

app.post('/api/explore/reverse-design', async (req, res) => {
  try {
    const productType = ensureValidName(String(req.body?.productType ?? ''), 'productType')
    const productName = ensureValidName(String(req.body?.productName ?? ''), 'productName')
    const threshold = Number(req.body?.threshold ?? 60)
    const densityStep = Number(req.body?.densityStep ?? 1)
    const thicknessStep = Number(req.body?.thicknessStep ?? 2)

    if (!Number.isFinite(threshold)) {
      throw new Error('threshold is invalid.')
    }
    if (!Number.isFinite(densityStep) || densityStep <= 0) {
      throw new Error('densityStep is invalid.')
    }
    if (!Number.isFinite(thicknessStep) || thicknessStep <= 0) {
      throw new Error('thicknessStep is invalid.')
    }

    const productMass = Number(req.body?.fixedInputs?.productMass)
    const dropHeightDirect = Number(req.body?.fixedInputs?.dropHeight)
    const fixedInputs = {
      tvLength: Number(req.body?.fixedInputs?.tvLength),
      tvWidth: Number(req.body?.fixedInputs?.tvWidth),
      tvHeight: Number(req.body?.fixedInputs?.tvHeight),
      dropHeight: Number.isFinite(productMass)
        ? getDropHeightByProductMass(productMass)
        : dropHeightDirect,
    }

    if (!Object.values(fixedInputs).every((value) => Number.isFinite(value))) {
      throw new Error('fixedInputs are invalid.')
    }

    const parameterRanges = Array.isArray(req.body?.parameterRanges)
      ? req.body.parameterRanges.map((item) => ({
          category: String(item?.category ?? '').trim(),
          densityMin: Number(item?.densityMin),
          densityMax: Number(item?.densityMax),
          thicknessMin: Number(item?.thicknessMin),
          thicknessMax: Number(item?.thicknessMax),
        }))
      : []

    if (parameterRanges.length < 1) {
      throw new Error('parameterRanges are required.')
    }

    for (const range of parameterRanges) {
      if (!['EPE', 'EPP', 'EPS'].includes(range.category)) {
        throw new Error(`Unsupported material category: ${range.category || 'Unknown'}.`)
      }
      if (
        !Number.isFinite(range.densityMin) ||
        !Number.isFinite(range.densityMax) ||
        !Number.isFinite(range.thicknessMin) ||
        !Number.isFinite(range.thicknessMax)
      ) {
        throw new Error(`Parameter range for ${range.category} is invalid.`)
      }
      if (range.densityMin > range.densityMax || range.thicknessMin > range.thicknessMax) {
        throw new Error(`Parameter range for ${range.category} is invalid.`)
      }
    }

    const { productPath } = resolveProductFolder(productType, productName)
    const activeModel = await resolveValidActiveModel(productPath)
    if (!activeModel) {
      throw new Error('No active model found for current Product type/Product name.')
    }

    const activeVersionPath = buildVersionDirectoryPath(productPath, activeModel.version)
    const { finalModelFileName, primaryFileName } = await readVersionModelFiles(activeVersionPath)
    const predictionModelFileName = finalModelFileName || primaryFileName
    if (!predictionModelFileName) {
      throw new Error('No deployable model file was found under the active version folder.')
    }

    const predictionModelPath = buildModelFilePath(productPath, activeModel.version, predictionModelFileName)
    const payload = await invokeRPlumber(
      '/explore-reverse-design',
      {
        modelPath: predictionModelPath,
        fixedInputs,
        threshold,
        densityStep,
        thicknessStep,
        parameterRanges,
      },
      'Failed to run reverse design from R plumber service.',
    )

    const gridRows = normalizeExploreGridRows(payload?.gridRows)
    const bestByCategory = normalizeExploreBestRows(payload?.bestByCategory)
    const bestOverallRows = normalizeExploreBestRows(payload?.bestOverall)
    const bestOverall = bestOverallRows[0] ?? null
    const summary = {
      totalPoints: Number(payload?.summary?.totalPoints ?? gridRows.length),
      feasiblePoints: Number(payload?.summary?.feasiblePoints ?? gridRows.filter((row) => row.feasible).length),
      threshold: Number(payload?.summary?.threshold ?? threshold),
      densityStep: Number(payload?.summary?.densityStep ?? densityStep),
      thicknessStep: Number(payload?.summary?.thicknessStep ?? thicknessStep),
    }

    res.json({
      productType,
      productName,
      activeModel: {
        version: activeModel.version,
        fileName: predictionModelFileName,
        uploadedAt: activeModel.activatedAt,
      },
      fixedInputs,
      parameterRanges,
      summary,
      gridRows,
      bestByCategory,
      bestOverall,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to run reverse design.',
    })
  }
})

app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await listNewTaskProjects()
    res.json({ projects })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to load projects.',
    })
  }
})

app.post('/api/projects', async (req, res) => {
  try {
    const { projectName, outputRoot } = resolveNewTaskProject(req.body?.projectName)
    const notes = normalizeProjectNotes(req.body?.notes ?? req.body?.note)
    if (!projectName) {
      throw new Error('projectName is invalid.')
    }
    if (await pathExists(outputRoot)) {
      res.status(409).json({
        message: 'Project already exists.',
      })
      return
    }

    await ensureDir(outputRoot)
    await writeProjectMeta(outputRoot, {
      notes,
      pinned: false,
    })
    const projectRecord = await buildNewTaskProjectRecord(projectName)
    res.status(201).json({
      project: projectRecord,
      message: `Created project ${projectName}.`,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to create project.',
    })
  }
})

app.patch('/api/projects/:projectName', async (req, res) => {
  try {
    const currentProjectName = ensureValidName(String(req.params.projectName ?? ''), 'projectName')
    const { outputRoot: currentOutputRoot } = resolveNewTaskProject(currentProjectName)
    if (!(await pathExists(currentOutputRoot))) {
      res.status(404).json({
        message: 'Project not found.',
      })
      return
    }

    const currentMeta = await readProjectMeta(currentOutputRoot)
    const hasProjectName = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'projectName')
    const hasNotes =
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'notes') ||
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'note')
    const hasPinned = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'pinned')

    const nextProjectName = hasProjectName
      ? ensureValidName(String(req.body?.projectName ?? ''), 'projectName')
      : currentProjectName
    const nextNotes = hasNotes ? normalizeProjectNotes(req.body?.notes ?? req.body?.note) : currentMeta.notes
    const nextPinned = hasPinned ? req.body?.pinned === true : currentMeta.pinned
    let targetOutputRoot = currentOutputRoot

    if (nextProjectName !== currentProjectName) {
      const { outputRoot: nextOutputRoot } = resolveNewTaskProject(nextProjectName)
      const currentComparablePath =
        process.platform === 'win32' ? currentOutputRoot.toLowerCase() : currentOutputRoot
      const nextComparablePath =
        process.platform === 'win32' ? nextOutputRoot.toLowerCase() : nextOutputRoot
      if (currentComparablePath !== nextComparablePath && (await pathExists(nextOutputRoot))) {
        res.status(409).json({
          message: 'A project with that name already exists.',
        })
        return
      }

      await renameProjectOutputRoot(currentOutputRoot, nextOutputRoot)
      targetOutputRoot = nextOutputRoot
    }

    await writeProjectMeta(targetOutputRoot, {
      notes: nextNotes,
      pinned: nextPinned,
    })

    const projectRecord = await buildNewTaskProjectRecord(nextProjectName)
    res.json({
      project: projectRecord,
      message:
        nextProjectName === currentProjectName
          ? `Updated project ${currentProjectName}.`
          : `Renamed project ${currentProjectName} to ${nextProjectName}.`,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to update project.',
    })
  }
})

app.delete('/api/projects/:projectName', async (req, res) => {
  try {
    const projectName = ensureValidName(String(req.params.projectName ?? ''), 'projectName')
    const { outputRoot } = resolveNewTaskProject(projectName)
    if (!(await pathExists(outputRoot))) {
      res.status(404).json({
        message: 'Project not found.',
      })
      return
    }

    await fsPromises.rm(outputRoot, { recursive: true, force: false })
    res.json({
      message: `Deleted project ${projectName}.`,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to delete project.',
    })
  }
})

app.get('/api/new-task/tasks', async (_req, res) => {
  try {
    res.json({
      tasks: await listNewTaskEntries(),
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to load task list.',
    })
  }
})

app.get('/api/new-task/task-detail', async (req, res) => {
  try {
    const fileName = ensureValidFileName(String(req.query.fileName ?? ''))
    if (!hasExtension(fileName, NEW_TASK_FILE_EXTENSION)) {
      throw new Error(`fileName must use ${NEW_TASK_FILE_EXTENSION}.`)
    }
    const { projectName, taskInputPath, predictedResultsFileName, predictedResultsPath } =
      buildNewTaskStoragePaths(req.query.projectName, fileName)
    if (!(await pathExists(taskInputPath))) {
      throw new Error('Task input file was not found.')
    }

    const taskSummary = await readNewTaskSummary(fileName, projectName)
    const taskContext = await resolveHistoricalTaskContext(fileName, taskSummary)
    const resolvedPredictedResultsFileName =
      taskSummary?.predictedResultsFileName || predictedResultsFileName

    let taskResults = taskSummary?.taskResults ?? []
    if (taskResults.length < 1) {
      if (await pathExists(predictedResultsPath)) {
        taskResults = normalizeNewTaskPredictionRows(
          readWorkbookRowsWithXlsx(predictedResultsPath, resolvedPredictedResultsFileName),
        )
      }
    }

    if (taskResults.length < 1) {
      throw new Error('No saved task results were found for this task.')
    }

    res.json({
      fileName,
      projectName,
      taskName: taskContext.taskName,
      productType: taskContext.productType,
      productName: taskContext.productName,
      isMultiple: taskContext.isMultiple,
      predictedResultsFileName: resolvedPredictedResultsFileName,
      canGenerateShap: Boolean(taskContext.productType && taskContext.productName),
      taskResults,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to load task detail.',
    })
  }
})

app.patch('/api/new-task/tasks/:fileName', async (req, res) => {
  try {
    const fileName = ensureValidFileName(String(req.params.fileName ?? ''))
    if (!hasExtension(fileName, NEW_TASK_FILE_EXTENSION)) {
      throw new Error(`fileName must use ${NEW_TASK_FILE_EXTENSION}.`)
    }

    const currentProjectName = String(req.body?.projectName ?? req.query.projectName ?? '').trim()
    const { projectName: normalizedCurrentProjectName, outputRoot: currentOutputRoot } =
      resolveNewTaskProject(currentProjectName)
    const currentTaskInputPath = path.join(currentOutputRoot, fileName)
    if (!(await pathExists(currentTaskInputPath))) {
      res.status(404).json({
        message: 'Task not found.',
      })
      return
    }

    const { summary: currentSummary } = await buildNewTaskSummaryPayload(fileName, normalizedCurrentProjectName)
    const hasTaskName = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'taskName')
    const hasPinned = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'pinned')
    const hasArchived = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'archived')
    const hasTargetProjectName =
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'targetProjectName') ||
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'nextProjectName')

    const nextTaskName = hasTaskName
      ? ensureValidName(String(req.body?.taskName ?? ''), 'taskName')
      : currentSummary.taskName
    const nextPinned = hasPinned ? req.body?.pinned === true : currentSummary.pinned
    const nextArchived = hasArchived ? req.body?.archived === true : currentSummary.archived
    const nextProjectName = hasTargetProjectName
      ? String(req.body?.targetProjectName ?? req.body?.nextProjectName ?? '').trim()
      : normalizedCurrentProjectName
    const { projectName: normalizedNextProjectName, outputRoot: nextOutputRoot } =
      resolveNewTaskProject(nextProjectName)

    if (normalizedNextProjectName) {
      if (!(await pathExists(nextOutputRoot))) {
        res.status(404).json({
          message: 'Target project not found.',
        })
        return
      }
    }

    await moveNewTaskRecord({
      fileName,
      currentProjectName: normalizedCurrentProjectName,
      targetProjectName: normalizedNextProjectName,
      predictedResultsFileName: currentSummary.predictedResultsFileName,
    })

    await writeNewTaskSummary({
      ...currentSummary,
      projectName: normalizedNextProjectName,
      taskName: nextTaskName,
      pinned: nextPinned,
      archived: nextArchived,
    })

    const { summary: nextSummary } = await buildNewTaskSummaryPayload(fileName, normalizedNextProjectName)
    const { outputRoot: resolvedOutputRoot } = resolveNewTaskProject(normalizedNextProjectName)
    const taskInputStats = await fsPromises.stat(path.join(resolvedOutputRoot, fileName))
    const createdAt =
      taskInputStats.birthtime instanceof Date && !Number.isNaN(taskInputStats.birthtime.getTime())
        ? taskInputStats.birthtime
        : taskInputStats.mtime

    res.json({
      task: {
        fileName,
        filePath: path.join(resolvedOutputRoot, fileName),
        taskName: nextSummary.taskName,
        modifiedAt: new Date().toISOString(),
        createdAt: createdAt.toISOString(),
        isMultiple: nextSummary.isMultiple,
        projectName: normalizedNextProjectName,
        pinned: nextSummary.pinned === true,
        archived: nextSummary.archived === true,
      },
      message: 'Updated task.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to update task.',
    })
  }
})

app.delete('/api/new-task/tasks/:fileName', async (req, res) => {
  try {
    const fileName = ensureValidFileName(String(req.params.fileName ?? ''))
    if (!hasExtension(fileName, NEW_TASK_FILE_EXTENSION)) {
      throw new Error(`fileName must use ${NEW_TASK_FILE_EXTENSION}.`)
    }

    const currentProjectName = String(req.query.projectName ?? req.body?.projectName ?? '').trim()
    const { projectName, outputRoot } = resolveNewTaskProject(currentProjectName)
    const taskInputPath = path.join(outputRoot, fileName)
    if (!(await pathExists(taskInputPath))) {
      res.status(404).json({
        message: 'Task not found.',
      })
      return
    }

    const { summary } = await buildNewTaskSummaryPayload(fileName, projectName)
    const predictedResultsPath = path.join(outputRoot, summary.predictedResultsFileName)
    const summaryPath = buildNewTaskSummaryPath(outputRoot, fileName)

    await fsPromises.rm(taskInputPath, { force: false })
    if (await pathExists(predictedResultsPath)) {
      await fsPromises.rm(predictedResultsPath, { force: false })
    }
    if (await pathExists(summaryPath)) {
      await fsPromises.rm(summaryPath, { force: false })
    }

    res.json({
      message: 'Deleted task.',
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to delete task.',
    })
  }
})

app.post('/api/new-task/start-prediction', async (req, res) => {
  try {
    const taskName = ensureValidName(String(req.body?.taskName ?? ''), 'taskName')
    const { projectName, outputRoot } = resolveNewTaskProject(req.body?.projectName)
    const productType = ensureValidName(String(req.body?.productType ?? ''), 'productType')
    const payload = req.body?.planPreview ?? {}
    const productName = ensureValidName(String(payload.productName ?? ''), 'productName')
    const productId = ensureValidName(String(payload.productId ?? ''), 'productId')
    const productMass = Number(payload.productMass ?? payload.dropHeight)
    const taskBaseName = taskName.toLowerCase().endsWith(NEW_TASK_FILE_EXTENSION)
      ? taskName.slice(0, -NEW_TASK_FILE_EXTENSION.length)
      : taskName
    const fileName = ensureValidFileName(
      `Task_${taskBaseName}_${productName}_${productId}${NEW_TASK_FILE_EXTENSION}`,
    )
    const predictedResultsFileName = buildPredictedResultsFileName(fileName)

    const row = {
      ID: productId,
      Drop_height: getDropHeightByProductMass(productMass),
      TV_length: Number(payload.tvLength),
      TV_width: Number(payload.tvWidth),
      TV_height: Number(payload.tvHeight),
      Liner_category: String(payload.linerCategory ?? '').trim(),
      Liner_density: Number(payload.linerDensity),
      Liner_thickness: Number(payload.linerThickness),
      Product_fragility: Number(payload.peakAcceleration),
    }

    if (!row.ID) {
      throw new Error('Product ID is required.')
    }
    if (!row.Liner_category) {
      throw new Error('Liner category is required.')
    }

    const numericFields = [
      ['Product mass', productMass],
      ['Product length', row.TV_length],
      ['Product width', row.TV_width],
      ['Product height', row.TV_height],
      ['Liner density', row.Liner_density],
      ['Liner thickness', row.Liner_thickness],
      ['Product fragility', row.Product_fragility],
    ]
    for (const [label, value] of numericFields) {
      if (!Number.isFinite(value)) {
        throw new Error(`${label} is invalid.`)
      }
    }

    await ensureDir(outputRoot)
    const targetPath = path.join(outputRoot, fileName)
    const predictedResultsPath = path.join(outputRoot, predictedResultsFileName)
    const worksheet = XLSX.utils.json_to_sheet([row], { header: NEW_TASK_HEADERS })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan preview')
    XLSX.writeFile(workbook, targetPath, { bookType: 'xlsx' })

    const { productPath } = resolveProductFolder(productType, productName)
    const activeModel = await resolveValidActiveModel(productPath)
    if (!activeModel) {
      throw new Error('No active model found for current Product type/Product name.')
    }

    const activeVersionPath = buildVersionDirectoryPath(productPath, activeModel.version)
    const { finalModelFileName, primaryFileName } = await readVersionModelFiles(activeVersionPath)
    const predictionModelFileName = finalModelFileName || primaryFileName
    if (!predictionModelFileName) {
      throw new Error('No deployable model file was found under the active version folder.')
    }

    const predictionModelPath = buildModelFilePath(productPath, activeModel.version, predictionModelFileName)
    if (!(await pathExists(predictionModelPath))) {
      throw new Error('Active model file was not found on disk.')
    }

    const predictionPayload = await invokeRPlumber(
      '/new-task-prediction',
      {
        modelPath: predictionModelPath,
        inputPath: targetPath,
        outputPath: predictedResultsPath,
      },
      'Failed to run Start prediction from R plumber service.',
    )
    const taskResults = normalizeNewTaskPredictionRows(
      Array.isArray(predictionPayload?.summaryRows) && predictionPayload.summaryRows.length > 0
        ? predictionPayload.summaryRows
        : predictionPayload?.rows,
    )
    if (taskResults.length < 1) {
      throw new Error('Prediction completed but no prediction result rows were returned.')
    }

    await persistNewTaskSummary({
      projectName,
      fileName,
      taskName: taskBaseName,
      productType,
      productName,
      isMultiple: false,
      predictedResultsFileName,
      taskResults,
    })

    const workbookWritten =
      Boolean(predictionPayload?.workbookGenerated) && (await pathExists(predictedResultsPath))
    const workbookMessage = workbookWritten
      ? ''
      : typeof predictionPayload?.workbookMessage === 'string' && predictionPayload.workbookMessage.trim()
        ? predictionPayload.workbookMessage.trim()
        : `${predictedResultsFileName} was not written to disk.`

    res.status(201).json({
      projectName,
      taskName: taskBaseName,
      fileName,
      filePath: targetPath,
      predictedResultsFileName,
      predictedResultsPath,
      taskResults,
      message: workbookWritten
        ? `Saved ${fileName} and ${predictedResultsFileName}.`
        : `Saved ${fileName}. Prediction workbook export skipped: ${workbookMessage}`,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to start prediction.',
    })
  }
})

app.post('/api/new-task/start-multiple-prediction', upload.single('schemeFile'), async (req, res) => {
  try {
    const taskName = ensureValidName(String(req.body?.taskName ?? ''), 'taskName')
    const { projectName, outputRoot } = resolveNewTaskProject(req.body?.projectName)
    const productType = ensureValidName(String(req.body?.productType ?? ''), 'productType')
    const productName = ensureValidName(String(req.body?.productName ?? ''), 'productName')
    const schemeFile = req.file
    if (!schemeFile) {
      throw new Error('schemeFile is required.')
    }

    const originalName = sanitizeFileName(String(schemeFile.originalname ?? ''))
    const extension = getFileExtension(originalName)
    if (!extension || !MULTIPLE_TASK_UPLOAD_EXTENSIONS.has(extension)) {
      throw new Error('schemeFile must use one of: .csv, .xlsx, .xls.')
    }

    const taskBaseName = taskName.toLowerCase().endsWith(NEW_TASK_FILE_EXTENSION)
      ? taskName.slice(0, -NEW_TASK_FILE_EXTENSION.length)
      : taskName
    const fileName = ensureValidFileName(`Task_${taskBaseName}_${productName}_multiple${NEW_TASK_FILE_EXTENSION}`)
    const predictedResultsFileName = buildPredictedResultsFileName(fileName)

    const { taskRows } = buildMultipleTaskRowsFromScheme(schemeFile.buffer)
    if (taskRows.length < 1) {
      throw new Error('Uploaded scheme file has no valid task rows.')
    }

    await ensureDir(outputRoot)
    const targetPath = path.join(outputRoot, fileName)
    const predictedResultsPath = path.join(outputRoot, predictedResultsFileName)
    const worksheet = XLSX.utils.json_to_sheet(taskRows, { header: NEW_TASK_HEADERS })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan preview')
    XLSX.writeFile(workbook, targetPath, { bookType: 'xlsx' })

    const { productPath } = resolveProductFolder(productType, productName)
    const activeModel = await resolveValidActiveModel(productPath)
    if (!activeModel) {
      throw new Error('No active model found for current Product type/Product name.')
    }

    const activeVersionPath = buildVersionDirectoryPath(productPath, activeModel.version)
    const { finalModelFileName, primaryFileName } = await readVersionModelFiles(activeVersionPath)
    const predictionModelFileName = finalModelFileName || primaryFileName
    if (!predictionModelFileName) {
      throw new Error('No deployable model file was found under the active version folder.')
    }

    const predictionModelPath = buildModelFilePath(productPath, activeModel.version, predictionModelFileName)
    if (!(await pathExists(predictionModelPath))) {
      throw new Error('Active model file was not found on disk.')
    }

    const predictionPayload = await invokeRPlumber(
      '/new-task-prediction',
      {
        modelPath: predictionModelPath,
        inputPath: targetPath,
        outputPath: predictedResultsPath,
      },
      'Failed to run Start prediction from R plumber service.',
    )
    const taskResults = normalizeNewTaskPredictionRows(
      Array.isArray(predictionPayload?.summaryRows) && predictionPayload.summaryRows.length > 0
        ? predictionPayload.summaryRows
        : predictionPayload?.rows,
    )
    if (taskResults.length < 1) {
      throw new Error('Prediction completed but no prediction result rows were returned.')
    }

    await persistNewTaskSummary({
      projectName,
      fileName,
      taskName: taskBaseName,
      productType,
      productName,
      isMultiple: true,
      predictedResultsFileName,
      taskResults,
    })

    const workbookWritten =
      Boolean(predictionPayload?.workbookGenerated) && (await pathExists(predictedResultsPath))
    const workbookMessage =
      workbookWritten
        ? ''
        : typeof predictionPayload?.workbookMessage === 'string' && predictionPayload.workbookMessage.trim()
          ? predictionPayload.workbookMessage.trim()
          : `${predictedResultsFileName} was not written to disk.`

    res.status(201).json({
      projectName,
      taskName: taskBaseName,
      fileName,
      filePath: targetPath,
      predictedResultsFileName,
      predictedResultsPath,
      taskResults,
      message: workbookWritten
        ? `Saved ${fileName} and ${predictedResultsFileName}.`
        : `Saved ${fileName}. Prediction workbook export skipped: ${workbookMessage}`,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to start multiple task prediction.',
    })
  }
})

app.get('/api/new-task/multiple-template', async (_req, res) => {
  try {
    if (!(await pathExists(MULTIPLE_TASK_TEMPLATE_PATH))) {
      res.status(404).json({
        message: `Template file not found: ${MULTIPLE_TASK_TEMPLATE_FILE_NAME}.`,
      })
      return
    }

    res.download(MULTIPLE_TASK_TEMPLATE_PATH, MULTIPLE_TASK_TEMPLATE_FILE_NAME)
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to download multiple tasks template.',
    })
  }
})

app.post('/api/new-task/shap-waterfall', async (req, res) => {
  try {
    const productType = ensureValidName(String(req.body?.productType ?? ''), 'productType')
    const payload = req.body?.planPreview ?? {}
    const productName = ensureValidName(String(payload.productName ?? ''), 'productName')
    const fileName = ensureValidFileName(String(req.body?.fileName ?? ''))
    if (!hasExtension(fileName, NEW_TASK_FILE_EXTENSION)) {
      throw new Error(`fileName must use ${NEW_TASK_FILE_EXTENSION}.`)
    }
    const targetId = String(req.body?.targetId ?? '').trim()
    if (!targetId) {
      throw new Error('targetId is invalid.')
    }
    const { taskInputPath } = buildNewTaskStoragePaths(req.body?.projectName, fileName)
    if (!(await pathExists(taskInputPath))) {
      throw new Error('Task input file was not found. Run Start prediction first.')
    }

    const { productPath } = resolveProductFolder(productType, productName)
    const activeModel = await resolveValidActiveModel(productPath)
    if (!activeModel) {
      throw new Error('No active model found for current Product type/Product name.')
    }

    const activeVersionPath = buildVersionDirectoryPath(productPath, activeModel.version)
    const { finalModelFileName, primaryFileName } = await readVersionModelFiles(activeVersionPath)
    const predictionModelFileName = finalModelFileName || primaryFileName
    if (!predictionModelFileName) {
      throw new Error('No deployable model file was found under the active version folder.')
    }

    const predictionModelPath = buildModelFilePath(productPath, activeModel.version, predictionModelFileName)
    if (!(await pathExists(predictionModelPath))) {
      throw new Error('Active model file was not found on disk.')
    }

    const shapPayload = await invokeRPlumber(
      '/new-task-shap-waterfall',
      {
        modelPath: predictionModelPath,
        inputPath: taskInputPath,
        targetId,
      },
      'Failed to generate SHAP waterfall from R plumber service.',
    )

    const baseline = Number(shapPayload?.baseline)
    const prediction = Number(shapPayload?.prediction)
    const steps = normalizeNewTaskShapSteps(shapPayload?.steps)
    if (!Number.isFinite(baseline) || !Number.isFinite(prediction) || steps.length < 1) {
      throw new Error('SHAP waterfall data is invalid.')
    }

    res.json({
      targetId: String(shapPayload?.targetId ?? targetId).trim(),
      baseline,
      prediction,
      steps,
    })
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to generate SHAP waterfall.',
    })
  }
})

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API route not found.' })
})

app.listen(PORT, async () => {
  await ensureDir(DATABASE_ROOT)
  await ensureDir(NEW_TASK_OUTPUT_ROOT)
  console.log(`Backend server listening at http://localhost:${PORT}`)
  console.log(`Model database path: ${DATABASE_ROOT}`)
  const resolvedRscript = getResolvedRscriptCandidate()
  console.log(`Resolved Rscript candidate: ${resolvedRscript || 'not found'}`)
  console.log(`R plumber target: ${R_PLUMBER_BASE_URL}`)
  try {
    const plumberStatus = await startRPlumberService()
    console.log(`R plumber service status: ${plumberStatus}`)
  } catch (error) {
    console.warn(
      `R plumber service is not ready: ${error instanceof Error ? error.message : 'Unknown error.'}`,
    )
  }
})
