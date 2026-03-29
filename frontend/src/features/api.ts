import { clearStoredAuthSession, emitAuthExpired, getAuthToken } from './auth'

export type ApiMessage = {
  message?: string
}

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || (import.meta.env.DEV ? '' : 'http://localhost:8787')
export const backendStartHint =
  'Unable to reach backend API. Start the backend server with "cd backend && npm run dev".'

export const normalizeInput = (value: string) => value.trim()
export const buildApiUrl = (path: string) => `${API_BASE_URL}${path}`

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const shouldInvalidateAuth = (path: string, response: Response, token: string) =>
  response.status === 401 && token.length > 0 && !path.startsWith('/api/auth/')

export const requestApi = async (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers)
  const token = getAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const response = await fetch(buildApiUrl(path), {
      ...init,
      headers,
    })

    if (shouldInvalidateAuth(path, response, token)) {
      clearStoredAuthSession()
      emitAuthExpired()
    }

    return response
  } catch {
    throw new Error(backendStartHint)
  }
}

export const parseApiResponse = async <T extends ApiMessage>(response: Response): Promise<T> => {
  const text = await response.text()

  if (!text) {
    if (response.ok) {
      return {} as T
    }

    throw new Error(`Request failed with status ${response.status}. ${backendStartHint}`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    if (!response.ok) {
      const normalizedText = stripHtml(text)
      if (normalizedText) {
        throw new Error(normalizedText.length > 220 ? `${normalizedText.slice(0, 217)}...` : normalizedText)
      }

      throw new Error(`Request failed with status ${response.status}.`)
    }

    throw new Error('Backend returned invalid JSON.')
  }
}

const decodeFileName = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const parseContentDispositionFileName = (headerValue: string | null, fallbackFileName: string) => {
  const normalizedHeader = String(headerValue ?? '').trim()
  if (!normalizedHeader) {
    return fallbackFileName
  }

  const utf8Match = normalizedHeader.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeFileName(utf8Match[1].trim())
  }

  const quotedMatch = normalizedHeader.match(/filename\s*=\s*"([^"]+)"/i)
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim()
  }

  const plainMatch = normalizedHeader.match(/filename\s*=\s*([^;]+)/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].trim()
  }

  return fallbackFileName
}

export const downloadApiFile = async (path: string, fallbackFileName: string) => {
  const response = await requestApi(path)
  if (!response.ok) {
    const payload = await parseApiResponse<ApiMessage>(response)
    throw new Error(payload.message ?? `Request failed with status ${response.status}.`)
  }

  const blob = await response.blob()
  const objectUrl = window.URL.createObjectURL(blob)
  const fileName = parseContentDispositionFileName(response.headers.get('content-disposition'), fallbackFileName)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(objectUrl)
}
