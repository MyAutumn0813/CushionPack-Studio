import { useEffect, useMemo, useState } from 'react'
import TaskHistoryDetailModal from '../features/components/TaskHistoryDetailModal'
import {
  normalizeInput,
  parseApiResponse,
  requestApi,
  type TaskHistoryItem,
  type TaskHistoryTasksResponse,
} from '../features/taskHistory'

export type SearchTaskItem = TaskHistoryItem

type SearchModalProps = {
  open: boolean
  onClose: () => void
  onSelectTask: (task: SearchTaskItem) => void
}

const getDateBucket = (value: string) => {
  const targetDate = new Date(value)
  if (Number.isNaN(targetDate.getTime())) {
    return 'Earlier'
  }

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
  const dayDiff = Math.floor((startOfToday.getTime() - startOfTarget.getTime()) / 86400000)
  if (dayDiff <= 0) {
    return 'Today'
  }
  if (dayDiff === 1) {
    return 'Yesterday'
  }
  if (dayDiff <= 7) {
    return 'Last 7 days'
  }
  return 'Earlier'
}

const dateBucketRank: Record<string, number> = {
  Today: 0,
  Yesterday: 1,
  'Last 7 days': 2,
  Earlier: 3,
}

export default function SearchModal({ open, onClose, onSelectTask }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState<SearchTaskItem[]>([])
  const [selectedTask, setSelectedTask] = useState<SearchTaskItem | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedTask(null)
      return
    }

    let disposed = false
    const loadTasks = async () => {
      setIsLoading(true)
      setError('')
      try {
        const response = await requestApi('/api/new-task/tasks')
        const payload = await parseApiResponse<TaskHistoryTasksResponse>(response)
        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to load task list.')
        }
        if (!disposed) {
          setTasks(Array.isArray(payload.tasks) ? payload.tasks : [])
        }
      } catch (loadError) {
        if (!disposed) {
          setTasks([])
          setError(loadError instanceof Error ? loadError.message : 'Failed to load task list.')
        }
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    }

    void loadTasks()
    return () => {
      disposed = true
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !selectedTask) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, open, selectedTask])

  const filteredTasks = useMemo(() => {
    const keyword = normalizeInput(query).toLowerCase()
    if (!keyword) {
      return tasks
    }
    return tasks.filter((task) => {
      const haystack = `${task.taskName} ${task.fileName} ${task.projectName ?? ''}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [query, tasks])

  const groupedTasks = useMemo(() => {
    const grouped = new Map<string, SearchTaskItem[]>()
    for (const task of filteredTasks) {
      const bucket = getDateBucket(task.modifiedAt)
      const rows = grouped.get(bucket) ?? []
      rows.push(task)
      grouped.set(bucket, rows)
    }

    return [...grouped.entries()]
      .sort((left, right) => (dateBucketRank[left[0]] ?? 999) - (dateBucketRank[right[0]] ?? 999))
      .map(([title, rows]) => ({ title, rows }))
  }, [filteredTasks])

  if (!open) {
    return null
  }

  return (
    <>
      <div className="search-modal-backdrop" onClick={onClose}>
        <section
          className="search-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="search-modal__header">
            <input
              id="search-modal-title"
              className="search-modal__input"
              type="text"
              placeholder="Search tasks..."
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="button" className="search-modal__close" aria-label="Close search" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M6 6l12 12" strokeLinecap="round" />
                <path d="M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="search-modal__body">
            <button
              type="button"
              className="search-task-row search-task-row--new"
              onClick={() =>
                onSelectTask({
                  fileName: '',
                  filePath: '',
                  taskName: 'New task',
                  modifiedAt: '',
                  createdAt: '',
                  isMultiple: false,
                })
              }
            >
              <span className="search-task-row__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 20l4.5-1 9.6-9.6a1.8 1.8 0 0 0 0-2.6l-.9-.9a1.8 1.8 0 0 0-2.6 0L5 15.5 4 20z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.5 7.5l3 3" strokeLinecap="round" />
                </svg>
              </span>
              <span className="search-task-row__title">New task</span>
            </button>

            {isLoading ? <div className="search-modal__status">Loading tasks...</div> : null}
            {!isLoading && error ? <div className="search-modal__status search-modal__status--error">{error}</div> : null}
            {!isLoading && !error && groupedTasks.length < 1 ? (
              <div className="search-modal__status">No executed task matched your search.</div>
            ) : null}

            {!isLoading && !error
              ? groupedTasks.map((group) => (
                  <section key={group.title} className="search-modal__group">
                    <h4 className="search-modal__group-title">{group.title}</h4>
                    <div className="search-modal__group-list">
                      {group.rows.map((task) => (
                        <button
                          key={`${task.projectName ?? 'general'}-${task.fileName}-${task.modifiedAt}`}
                          type="button"
                          className="search-task-row"
                          title={task.fileName}
                          onClick={() => setSelectedTask(task)}
                        >
                          <span className="search-task-row__icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M4 12c0-4 3-7 8-7s8 3 8 7-3 7-8 7a8.6 8.6 0 0 1-3.7-.8L5 19l.8-3.2A6.8 6.8 0 0 1 4 12z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                            <span className="search-task-row__content">
                              <span className="search-task-row__title">{task.taskName}</span>
                              <span className="search-task-row__meta">
                                {task.projectName ? `${task.projectName} | ` : ''}
                                {task.archived ? 'Archived' : task.isMultiple ? 'Multiple tasks' : 'Single task'} |{' '}
                                {task.fileName}
                              </span>
                            </span>
                          </button>
                      ))}
                    </div>
                  </section>
                ))
              : null}
          </div>
        </section>
      </div>

      <TaskHistoryDetailModal
        open={Boolean(selectedTask)}
        task={selectedTask}
        onClose={onClose}
        onBack={() => setSelectedTask(null)}
      />
    </>
  )
}
