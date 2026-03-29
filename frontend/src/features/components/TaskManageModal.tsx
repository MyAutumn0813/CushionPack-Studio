import { useEffect, useMemo, useState } from 'react'
import type { SearchTaskItem } from '../../pages/Search'
import DropdownSelect from './DropdownSelect'

type TaskManageModalProps = {
  open: boolean
  mode: 'rename' | 'move'
  task: SearchTaskItem | null
  projects: Array<{
    name: string
  }>
  isSubmitting: boolean
  error: string
  onClose: () => void
  onSubmit: (payload: { taskName: string; targetProjectName: string }) => void | Promise<void>
}

export default function TaskManageModal({
  open,
  mode,
  task,
  projects,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: TaskManageModalProps) {
  const [taskName, setTaskName] = useState('')
  const [targetProjectName, setTargetProjectName] = useState('')
  const dialogTitle = mode === 'move' ? 'Move Task' : 'Rename Task'
  const submitLabel = mode === 'move' ? 'Move' : 'Save'
  const submittingLabel = mode === 'move' ? 'Moving...' : 'Saving...'
  const selectOptions = useMemo(
    () =>
      [
        { value: '', label: 'General (no project)' },
        ...projects.map((project) => ({
          value: project.name,
          label: project.name,
        })),
      ].filter((option, index, list) => list.findIndex((candidate) => candidate.value === option.value) === index),
    [projects],
  )

  useEffect(() => {
    if (!open || !task) {
      setTaskName('')
      setTargetProjectName('')
      return
    }

    setTaskName(task.taskName)
    setTargetProjectName(String(task.projectName ?? '').trim())

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isSubmitting, onClose, open, task])

  if (!open || !task) {
    return null
  }

  return (
    <div className="project-create-modal-backdrop" onClick={() => (!isSubmitting ? onClose() : undefined)}>
      <section
        className="project-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-manage-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="project-create-modal__header">
          <h2 id="task-manage-title" className="project-create-modal__title">
            {dialogTitle}
          </h2>
          <button
            type="button"
            className="project-create-modal__close"
            aria-label={`Close ${dialogTitle.toLowerCase()} dialog`}
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
              {mode === 'move' ? (
                <path d="M3.5 7.5a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <>
                  <path d="M4 20h4l10-10a2.3 2.3 0 0 0-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.5 6.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
          </div>
        </div>

        <div className="project-create-modal__body">
          <div className="task-manage-modal__context">
            <span className="project-create-modal__label">Current task</span>
            <div className="task-manage-modal__context-value">{task.taskName}</div>
          </div>

          {mode === 'rename' ? (
            <label className="project-create-modal__field">
              <span className="project-create-modal__label">Task name</span>
              <input
                className="project-create-modal__input"
                type="text"
                value={taskName}
                placeholder="Enter task name"
                autoFocus
                maxLength={120}
                onChange={(event) => setTaskName(event.target.value)}
              />
            </label>
          ) : (
            <label className="project-create-modal__field">
              <span className="project-create-modal__label">Target project</span>
              <DropdownSelect
                className="project-create-modal__input project-create-modal__select"
                value={targetProjectName}
                autoFocus
                onChange={(event) => setTargetProjectName(event.target.value)}
              >
                {selectOptions.map((option) => (
                  <option key={option.value || '__general__'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </DropdownSelect>
            </label>
          )}

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
            onClick={() => void onSubmit({ taskName, targetProjectName })}
            disabled={isSubmitting}
          >
            {isSubmitting ? submittingLabel : submitLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
