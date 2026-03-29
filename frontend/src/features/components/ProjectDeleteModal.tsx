import { useEffect } from 'react'

type ProjectDeleteModalProps = {
  open: boolean
  projectName: string
  isSubmitting: boolean
  error: string
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

export default function ProjectDeleteModal({
  open,
  projectName,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: ProjectDeleteModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isSubmitting, onClose, open])

  if (!open) {
    return null
  }

  return (
    <div className="project-create-modal-backdrop" onClick={() => (!isSubmitting ? onClose() : undefined)}>
      <section
        className="project-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="project-create-modal__header">
          <h2 id="project-delete-title" className="project-create-modal__title">
            Delete Project
          </h2>
          <button
            type="button"
            className="project-create-modal__close"
            aria-label="Close delete project dialog"
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
          <div className="project-create-modal__hero-icon project-create-modal__hero-icon--danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 7h14" strokeLinecap="round" />
              <path d="M9 7V5h6v2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 11v5" strokeLinecap="round" />
              <path d="M14 11v5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="project-create-modal__body">
          <p className="project-delete-modal__summary">
            Delete project <span className="project-delete-modal__name">{projectName}</span>?
          </p>
          <p className="project-delete-modal__warning">
            This will permanently remove the project folder and all executed tasks saved under it.
          </p>
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
            className="btn btn--danger project-create-modal__action"
            onClick={() => void onConfirm()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Deleting...' : 'Delete'}
          </button>
        </footer>
      </section>
    </div>
  )
}
