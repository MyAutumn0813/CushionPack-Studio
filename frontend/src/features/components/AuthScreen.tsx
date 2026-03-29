import { useState, type FormEvent } from 'react'

type AuthMode = 'sign-in' | 'sign-up'

type AuthScreenProps = {
  error?: string
  isChecking?: boolean
  isSubmitting?: boolean
  onClearError?: () => void
  onAuthenticate: (payload: {
    mode: AuthMode
    email: string
    password: string
  }) => Promise<void> | void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function EmailIcon() {
  return (
    <svg stroke="currentColor" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EyeOpenIcon() {
  return (
    <svg stroke="currentColor" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <path
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EyeClosedIcon() {
  return (
    <svg stroke="currentColor" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.7 13.3a3 3 0 004.1-4.1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M3 3l18 18M10.6 5.1A9.6 9.6 0 0112 5c4.478 0 8.268 2.943 9.542 7a9.72 9.72 0 01-4.04 5.06M6.1 6.1A10.15 10.15 0 002.458 12C3.732 16.057 7.523 19 12 19c1.28 0 2.5-.24 3.62-.68"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function AuthScreen({
  error = '',
  isChecking = false,
  isSubmitting = false,
  onClearError,
  onAuthenticate,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const [localError, setLocalError] = useState('')

  const isSignUp = mode === 'sign-up'
  const title = isSignUp ? 'Create your account' : 'Sign in to your account'
  const submitLabel = isSignUp ? 'Sign up' : 'Sign in'
  const helperText = isSignUp ? 'Already have an account?' : 'No account?'
  const switchLabel = isSignUp ? 'Sign in' : 'Sign up'

  const resolvedError = localError || error

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setLocalError('Please enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.')
      return
    }
    if (isSignUp && password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    setLocalError('')
    await onAuthenticate({
      mode,
      email: normalizedEmail,
      password,
    })
  }

  return (
    <div className="auth-shell">
      <div className="auth-shell__ambient" aria-hidden="true">
        <span className="auth-shell__orb auth-shell__orb--one" />
        <span className="auth-shell__orb auth-shell__orb--two" />
        <span className="auth-shell__orb auth-shell__orb--three" />
      </div>

      <div className="auth-layout">
        <section className="auth-showcase">
          <h1 className="auth-showcase__title">CushionPack Studio</h1>
          <p className="auth-showcase__body">
            Register a local account or sign in to access the existing workspace.
          </p>
          <div className="auth-showcase__stats">
            <div className="auth-showcase__stat">
              <strong>Library</strong>
              <span>Multiple model and performane preview</span>
            </div>
            <div className="auth-showcase__stat">
              <strong>New Task</strong>
              <span>Single and batch prediction</span>
            </div>
            <div className="auth-showcase__stat">
              <strong>Explore</strong>
              <span>Reverse design with feasible domain analysis</span>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={`auth-mode-switch__item ${!isSignUp ? 'is-active' : ''}`}
                onClick={() => {
                  setMode('sign-in')
                  setIsPasswordVisible(false)
                  setIsConfirmPasswordVisible(false)
                  setLocalError('')
                  onClearError?.()
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`auth-mode-switch__item ${isSignUp ? 'is-active' : ''}`}
                onClick={() => {
                  setMode('sign-up')
                  setIsPasswordVisible(false)
                  setIsConfirmPasswordVisible(false)
                  setLocalError('')
                  onClearError?.()
                }}
              >
                Sign up
              </button>
            </div>

            <p className="auth-form-title">{title}</p>
            <p className="auth-form-subtitle">
              {isSignUp ? 'Use email and password to create a local account.' : 'Use your registered email and password.'}
            </p>

            <div className="auth-input-container">
              <input
                autoComplete="email"
                placeholder="Enter email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setLocalError('')
                  onClearError?.()
                }}
                disabled={isChecking || isSubmitting}
              />
              <span>
                <EmailIcon />
              </span>
            </div>

            <div className="auth-input-container">
              <input
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder="Enter password"
                type={isPasswordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setLocalError('')
                  onClearError?.()
                }}
                disabled={isChecking || isSubmitting}
              />
              <button
                type="button"
                className="auth-input-action"
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                disabled={isChecking || isSubmitting}
              >
                {isPasswordVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </button>
            </div>

            {isSignUp ? (
              <div className="auth-input-container">
                <input
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  type={isConfirmPasswordVisible ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value)
                    setLocalError('')
                    onClearError?.()
                  }}
                  disabled={isChecking || isSubmitting}
                />
                <button
                  type="button"
                  className="auth-input-action"
                  aria-label={isConfirmPasswordVisible ? 'Hide confirm password' : 'Show confirm password'}
                  aria-pressed={isConfirmPasswordVisible}
                  onClick={() => setIsConfirmPasswordVisible((visible) => !visible)}
                  disabled={isChecking || isSubmitting}
                >
                  {isConfirmPasswordVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
              </div>
            ) : null}

            {resolvedError ? <div className="auth-form-error">{resolvedError}</div> : null}

            <button className="auth-submit" type="submit" disabled={isChecking || isSubmitting}>
              {isChecking ? 'Checking session...' : isSubmitting ? 'Submitting...' : submitLabel}
            </button>

            <p className="auth-switch-link">
              {helperText}
              <button
                type="button"
                onClick={() => {
                  setMode(isSignUp ? 'sign-in' : 'sign-up')
                  setIsPasswordVisible(false)
                  setIsConfirmPasswordVisible(false)
                  setLocalError('')
                  onClearError?.()
                }}
                disabled={isChecking || isSubmitting}
              >
                {switchLabel}
              </button>
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}
