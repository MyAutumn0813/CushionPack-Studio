import { useEffect, useState } from 'react'

type ProjectCreateModalProps = {
  open: boolean
  mode?: 'create' | 'edit'
  isSubmitting: boolean
  error: string
  initialProjectName?: string
  initialNote?: string
  onClose: () => void
  onSubmit: (projectName: string, note: string) => void | Promise<void>
}

export default function ProjectCreateModal({
  open,
  mode = 'create',
  isSubmitting,
  error,
  initialProjectName = '',
  initialNote = '',
  onClose,
  onSubmit,
}: ProjectCreateModalProps) {
  const [projectName, setProjectName] = useState('')
  const [note, setNote] = useState('')
  const dialogTitle = mode === 'edit' ? 'Edit Project' : 'Create Project'
  const closeLabel = mode === 'edit' ? 'Close edit project dialog' : 'Close create project dialog'
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create'
  const submittingLabel = mode === 'edit' ? 'Saving...' : 'Creating...'

  useEffect(() => {
    if (!open) {
      setProjectName('')
      setNote('')
      return
    }

    setProjectName(initialProjectName)
    setNote(initialNote)

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [initialNote, initialProjectName, isSubmitting, onClose, open])

  if (!open) {
    return null
  }

  return (
    <div className="project-create-modal-backdrop" onClick={() => (!isSubmitting ? onClose() : undefined)}>
      <section
        className="project-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="project-create-modal__header">
          <h2 id="project-create-title" className="project-create-modal__title">
            {dialogTitle}
          </h2>
          <button
            type="button"
            className="project-create-modal__close"
            aria-label={closeLabel}
            onClick={onClose}
            disabled={isSubmitting}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 6l12 12" strokeLinecap="round" />
              <path d="M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="project-create-modal__hero" aria-hidden="true">
          <div className="project-create-modal__hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3.5 7.5a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div className="project-create-modal__body">
          <label className="project-create-modal__field">
            <span className="project-create-modal__label">Project name</span>
            <input
              className="project-create-modal__input"
              type="text"
              value={projectName}
              placeholder="Enter project name"
              autoFocus
              maxLength={120}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>

          <label className="project-create-modal__field">
            <span className="project-create-modal__label">Notes (optional)</span>
            <textarea
              className="project-create-modal__textarea"
              value={note}
              placeholder='Example: "Television redesign batch" or "Project workspace for customer A".'
              rows={5}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {error ? <div className="project-create-modal__error">{error}</div> : null}
        </div>

        <footer className="project-create-modal__actions">
          <button
            type="button"
            className="btn library-action-btn library-action-btn--white project-create-modal__action"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn library-action-btn library-action-btn--green project-create-modal__action"
            onClick={() => void onSubmit(projectName, note)}
            disabled={isSubmitting}
          >
            {isSubmitting ? submittingLabel : submitLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
