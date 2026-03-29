import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import HomeUI from './pages/Home'
import NewTaskPage from './pages/New task'
import LibraryPage from './pages/Library'
import ExplorePage from './pages/Explore'
import SearchModal, { type SearchTaskItem } from './pages/Search'
import AuthScreen from './features/components/AuthScreen'
import AccountProfileModal from './features/components/AccountProfileModal'
import AccountSettingsModal from './features/components/AccountSettingsModal'
import TaskHistoryDetailModal from './features/components/TaskHistoryDetailModal'
import ProjectCreateModal from './features/components/ProjectCreateModal'
import ProjectDeleteModal from './features/components/ProjectDeleteModal'
import TaskManageModal from './features/components/TaskManageModal'
import TaskDeleteModal from './features/components/TaskDeleteModal'
import { parseApiResponse, requestApi } from './features/api'
import {
  buildDefaultAccountProfile,
  buildDefaultAccountSettings,
  readAccountPreferences,
  writeAccountPreferences,
  type AccountProfile,
  type AccountSettings,
} from './features/accountPreferences'
import {
  AUTH_EXPIRED_EVENT,
  clearStoredAuthSession,
  hasFeatureAccess,
  normalizeAuthUser,
  readStoredAuthSession,
  writeStoredAuthSession,
  type AuthResponse,
  type AuthUser,
} from './features/auth'
import { type TaskHistoryTasksResponse } from './features/taskHistory'
import './App.css'

type ViewKey = 'home' | 'model' | 'predict' | 'explain'

type SidebarProject = {
  id: string
  name: string
  createdAt: string
  modifiedAt: string
  taskCount: number
  notes: string
  pinned: boolean
}

type ProjectPayload = {
  projectName?: string
  createdAt?: string
  modifiedAt?: string
  taskCount?: number
  notes?: string
  pinned?: boolean
}

type ProjectListResponse = {
  message?: string
  projects?: ProjectPayload[]
}

type ProjectMutationResponse = {
  message?: string
  project?: ProjectPayload
}

type TaskMutationResponse = {
  message?: string
  task?: SearchTaskItem
}

type StudioAppProps = {
  currentUser: AuthUser
  isSigningOut: boolean
  onSignOut: () => Promise<void> | void
}

type AuthStatus = 'checking' | 'unauthenticated' | 'authenticated'

const MAX_VISIBLE_PROJECTS = 5
const ACCOUNT_MENU_WIDTH = 252
const ACCOUNT_MENU_OFFSET = 14
const SIDEBAR_MENU_WIDTH = 184
const SIDEBAR_MENU_OFFSET = 8
const SIDEBAR_MENU_VIEWPORT_PADDING = 12

const getAccountInitials = (displayName: string, username: string, email: string) => {
  const source = String(displayName || username || email).trim()
  if (!source) {
    return 'CP'
  }

  const words = source.split(/\s+/).filter((word) => word.length > 0)
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
  }

  return source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'CP'
}

const normalizeSidebarProject = (project?: ProjectPayload): SidebarProject | null => {
  const name = String(project?.projectName ?? '').trim()
  if (!name) {
    return null
  }

  return {
    id: name,
    name,
    createdAt: String(project?.createdAt ?? '').trim(),
    modifiedAt: String(project?.modifiedAt ?? '').trim(),
    taskCount: Number(project?.taskCount ?? 0),
    notes: String(project?.notes ?? '').trim(),
    pinned: project?.pinned === true,
  }
}

const buildTaskMenuKey = (task: Pick<SearchTaskItem, 'projectName' | 'fileName'>) =>
  `${String(task.projectName ?? '').trim()}::${String(task.fileName ?? '').trim()}`

const searchNavItem: { label: string; icon: ReactNode } = {
  label: 'Search',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  ),
}

const navItems: Array<{ id: ViewKey; label: string; icon: ReactNode }> = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg className="nav-button__icon--home" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 10.5L12 4l8 6.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 9.5V20h11V9.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 20v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'model',
    label: 'Library',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <ellipse cx="12" cy="6" rx="6.5" ry="2.5" />
        <path d="M5.5 6v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6" />
        <path d="M5.5 11v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
        <path d="M5.5 16v2c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-2" />
      </svg>
    ),
  },
  {
    id: 'predict',
    label: 'New task',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M5 19V6" strokeLinecap="round" />
        <path d="M5 19h14" strokeLinecap="round" />
        <path d="M8 14l3-3 3 2 4-5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 8h-3V5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'explain',
    label: 'Explore',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 4a5 5 0 0 0-3.6 8.5c.9.9 1.4 1.8 1.6 2.8h4c.2-1 .7-1.9 1.6-2.8A5 5 0 0 0 12 4z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 18h4" strokeLinecap="round" />
        <path d="M10.5 21h3" strokeLinecap="round" />
      </svg>
    ),
  },
]

const viewMeta: Record<ViewKey, { component: ReactNode }> = {
  home: {
    component: <HomeUI />,
  },
  model: {
    component: <LibraryPage />,
  },
  predict: {
    component: <NewTaskPage />,
  },
  explain: {
    component: <ExplorePage />,
  },
}

function StudioApp({ currentUser, isSigningOut, onSignOut }: StudioAppProps) {
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null)
  const taskMenuPopoverRef = useRef<HTMLDivElement | null>(null)
  const taskMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [activeProjectName, setActiveProjectName] = useState('')
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [isProjectCreateModalOpen, setIsProjectCreateModalOpen] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [projectCreateError, setProjectCreateError] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [moreProjectsOpen, setMoreProjectsOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(true)
  const [archivedTasksOpen, setArchivedTasksOpen] = useState(false)
  const [expandedProjectNames, setExpandedProjectNames] = useState<string[]>([])
  const [projectMenuOpenName, setProjectMenuOpenName] = useState('')
  const [taskMenuOpenKey, setTaskMenuOpenKey] = useState('')
  const [taskMenuOpenInstanceId, setTaskMenuOpenInstanceId] = useState('')
  const [taskMenuAnchorTask, setTaskMenuAnchorTask] = useState<SearchTaskItem | null>(null)
  const [taskMenuPosition, setTaskMenuPosition] = useState({
    top: 0,
    left: 0,
    maxHeight: 240,
  })
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [accountProfile, setAccountProfile] = useState<AccountProfile>(() => buildDefaultAccountProfile(currentUser))
  const [accountSettings, setAccountSettings] = useState<AccountSettings>(() => buildDefaultAccountSettings())
  const [accountMenuPosition, setAccountMenuPosition] = useState({
    left: 12,
    bottom: 88,
    width: ACCOUNT_MENU_WIDTH,
  })
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [editingProject, setEditingProject] = useState<SidebarProject | null>(null)
  const [isUpdatingProject, setIsUpdatingProject] = useState(false)
  const [projectUpdateError, setProjectUpdateError] = useState('')
  const [projectPinningName, setProjectPinningName] = useState('')
  const [deletingProject, setDeletingProject] = useState<SidebarProject | null>(null)
  const [isDeletingProject, setIsDeletingProject] = useState(false)
  const [projectDeleteError, setProjectDeleteError] = useState('')
  const [sidebarTasks, setSidebarTasks] = useState<SearchTaskItem[]>([])
  const [editingTask, setEditingTask] = useState<SearchTaskItem | null>(null)
  const [movingTask, setMovingTask] = useState<SearchTaskItem | null>(null)
  const [isUpdatingTask, setIsUpdatingTask] = useState(false)
  const [taskUpdateError, setTaskUpdateError] = useState('')
  const [taskTogglingKey, setTaskTogglingKey] = useState('')
  const [deletingTask, setDeletingTask] = useState<SearchTaskItem | null>(null)
  const [isDeletingTask, setIsDeletingTask] = useState(false)
  const [taskDeleteError, setTaskDeleteError] = useState('')
  const [isLoadingSidebarTasks, setIsLoadingSidebarTasks] = useState(false)
  const [hasLoadedSidebarTasks, setHasLoadedSidebarTasks] = useState(false)
  const [sidebarTasksError, setSidebarTasksError] = useState('')
  const [selectedSidebarTask, setSelectedSidebarTask] = useState<SearchTaskItem | null>(null)

  const canAccessLibrary = hasFeatureAccess(currentUser, 'library')
  const canAccessNewTask = hasFeatureAccess(currentUser, 'newTask')
  const canAccessExplore = hasFeatureAccess(currentUser, 'explore')
  const isHomeView = activeView === 'home'
  const visibleProjects = projects.slice(0, MAX_VISIBLE_PROJECTS)
  const overflowProjects = projects.slice(MAX_VISIBLE_PROJECTS)
  const showOverflowProjects = moreProjectsOpen && overflowProjects.length > 0
  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.id === 'home') {
          return true
        }
        if (item.id === 'model') {
          return canAccessLibrary
        }
        if (item.id === 'predict') {
          return canAccessNewTask
        }
        if (item.id === 'explain') {
          return canAccessExplore
        }
        return false
      }),
    [canAccessExplore, canAccessLibrary, canAccessNewTask],
  )
  const accountInitials = useMemo(
    () => getAccountInitials(accountProfile.displayName, accountProfile.username, currentUser.email),
    [accountProfile.displayName, accountProfile.username, currentUser.email],
  )
  const activeSidebarTasks = useMemo(
    () => sidebarTasks.filter((task) => task.archived !== true),
    [sidebarTasks],
  )
  const archivedSidebarTasks = useMemo(
    () => sidebarTasks.filter((task) => task.archived === true),
    [sidebarTasks],
  )
  const projectTasksByName = useMemo(() => {
    const groupedTasks = new Map<string, SearchTaskItem[]>()
    for (const task of activeSidebarTasks) {
      const projectName = String(task.projectName ?? '').trim()
      if (!projectName) {
        continue
      }

      const existingTasks = groupedTasks.get(projectName)
      if (existingTasks) {
        existingTasks.push(task)
      } else {
        groupedTasks.set(projectName, [task])
      }
    }

    return groupedTasks
  }, [activeSidebarTasks])

  const persistAccountPreferences = (nextProfile: AccountProfile, nextSettings: AccountSettings) => {
    writeAccountPreferences(currentUser, {
      profile: nextProfile,
      settings: nextSettings,
    })
  }

  const updateAccountMenuPosition = () => {
    const trigger = accountTriggerRef.current
    if (!trigger || typeof window === 'undefined') {
      return
    }

    const rect = trigger.getBoundingClientRect()
    const width = Math.min(ACCOUNT_MENU_WIDTH, Math.max(220, window.innerWidth - 24))
    const maxLeft = Math.max(12, window.innerWidth - width - 12)
    const nextLeft = Math.max(12, Math.min(rect.left, maxLeft))
    const nextBottom = Math.max(12, window.innerHeight - rect.top + ACCOUNT_MENU_OFFSET)

    setAccountMenuPosition({
      left: nextLeft,
      bottom: nextBottom,
      width,
    })
  }

  const handleSaveProfile = (nextProfile: AccountProfile) => {
    setAccountProfile(nextProfile)
    persistAccountPreferences(nextProfile, accountSettings)
    setIsProfileModalOpen(false)
  }

  const handleChangeSettings = (nextSettings: AccountSettings) => {
    setAccountSettings(nextSettings)
    persistAccountPreferences(accountProfile, nextSettings)
  }

  useEffect(() => {
    const preferences = readAccountPreferences(currentUser)
    setAccountProfile(preferences.profile)
    setAccountSettings(preferences.settings)
  }, [currentUser])

  useEffect(() => {
    const root = document.documentElement
    const accentPalette = {
      Blue: {
        accent: '#2563eb',
        accentStrong: '#1d4ed8',
        accentWarm: '#60a5fa',
        accentTeal: '#0ea5e9',
        border: '#dbeafe',
      },
      Green: {
        accent: '#0f766e',
        accentStrong: '#059669',
        accentWarm: '#34d399',
        accentTeal: '#14b8a6',
        border: '#d1fae5',
      },
      Amber: {
        accent: '#b45309',
        accentStrong: '#d97706',
        accentWarm: '#f59e0b',
        accentTeal: '#0f766e',
        border: '#fde68a',
      },
      Pink: {
        accent: '#db2777',
        accentStrong: '#be185d',
        accentWarm: '#f472b6',
        accentTeal: '#ec4899',
        border: '#fbcfe8',
      },
      Orange: {
        accent: '#ea580c',
        accentStrong: '#c2410c',
        accentWarm: '#fb923c',
        accentTeal: '#f97316',
        border: '#fed7aa',
      },
      Purple: {
        accent: '#7c3aed',
        accentStrong: '#6d28d9',
        accentWarm: '#a78bfa',
        accentTeal: '#8b5cf6',
        border: '#e9d5ff',
      },
    } as const

    const actionPalette = {
      Blue: {
        bg: '#3b82f6',
        hover: '#60a5fa',
        active: '#2563eb',
        border: 'rgba(59, 130, 246, 0.3)',
        shadow: '0 8px 18px rgba(59, 130, 246, 0.28)',
        glow: '0 0 20px rgba(96, 165, 250, 0.35)',
        softBg: 'rgba(59, 130, 246, 0.12)',
        softBorder: 'rgba(59, 130, 246, 0.3)',
        softText: '#dbeafe',
        softGlow: '0 0 16px rgba(59, 130, 246, 0.16)',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
        gradientHover: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
        gradientActive: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
      },
      Green: {
        bg: '#10b981',
        hover: '#34d399',
        active: '#059669',
        border: 'rgba(16, 185, 129, 0.3)',
        shadow: '0 8px 18px rgba(16, 185, 129, 0.28)',
        glow: '0 0 20px rgba(52, 211, 153, 0.35)',
        softBg: 'rgba(16, 185, 129, 0.12)',
        softBorder: 'rgba(16, 185, 129, 0.3)',
        softText: '#d1fae5',
        softGlow: '0 0 16px rgba(16, 185, 129, 0.16)',
        gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
        gradientHover: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)',
        gradientActive: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
      },
      Amber: {
        bg: '#d97706',
        hover: '#f59e0b',
        active: '#b45309',
        border: 'rgba(217, 119, 6, 0.3)',
        shadow: '0 8px 18px rgba(217, 119, 6, 0.28)',
        glow: '0 0 20px rgba(245, 158, 11, 0.34)',
        softBg: 'rgba(217, 119, 6, 0.14)',
        softBorder: 'rgba(217, 119, 6, 0.3)',
        softText: '#fef3c7',
        softGlow: '0 0 16px rgba(217, 119, 6, 0.16)',
        gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        gradientHover: 'linear-gradient(135deg, #ea580c 0%, #fbbf24 100%)',
        gradientActive: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
      },
      Pink: {
        bg: '#db2777',
        hover: '#ec4899',
        active: '#be185d',
        border: 'rgba(219, 39, 119, 0.3)',
        shadow: '0 8px 18px rgba(219, 39, 119, 0.28)',
        glow: '0 0 20px rgba(236, 72, 153, 0.35)',
        softBg: 'rgba(219, 39, 119, 0.14)',
        softBorder: 'rgba(219, 39, 119, 0.28)',
        softText: '#fce7f3',
        softGlow: '0 0 16px rgba(219, 39, 119, 0.16)',
        gradient: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)',
        gradientHover: 'linear-gradient(135deg, #be185d 0%, #f472b6 100%)',
        gradientActive: 'linear-gradient(135deg, #9d174d 0%, #db2777 100%)',
      },
      Orange: {
        bg: '#ea580c',
        hover: '#f97316',
        active: '#c2410c',
        border: 'rgba(234, 88, 12, 0.3)',
        shadow: '0 8px 18px rgba(234, 88, 12, 0.28)',
        glow: '0 0 20px rgba(249, 115, 22, 0.35)',
        softBg: 'rgba(234, 88, 12, 0.14)',
        softBorder: 'rgba(234, 88, 12, 0.28)',
        softText: '#ffedd5',
        softGlow: '0 0 16px rgba(234, 88, 12, 0.16)',
        gradient: 'linear-gradient(135deg, #ea580c 0%, #fb923c 100%)',
        gradientHover: 'linear-gradient(135deg, #c2410c 0%, #fdba74 100%)',
        gradientActive: 'linear-gradient(135deg, #9a3412 0%, #ea580c 100%)',
      },
      Purple: {
        bg: '#7c3aed',
        hover: '#8b5cf6',
        active: '#6d28d9',
        border: 'rgba(124, 58, 237, 0.3)',
        shadow: '0 8px 18px rgba(124, 58, 237, 0.28)',
        glow: '0 0 20px rgba(139, 92, 246, 0.35)',
        softBg: 'rgba(124, 58, 237, 0.14)',
        softBorder: 'rgba(124, 58, 237, 0.28)',
        softText: '#ede9fe',
        softGlow: '0 0 16px rgba(124, 58, 237, 0.16)',
        gradient: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
        gradientHover: 'linear-gradient(135deg, #6d28d9 0%, #c4b5fd 100%)',
        gradientActive: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)',
      },
    } as const

    const appearancePalette = {
      Light: {
        bg: '#ffffff',
        surface: '#ffffff',
        surfaceAlt: '#f4f0ff',
        sidebarSurface: 'rgba(247, 247, 245, 0.94)',
        sidebarSurfaceStrong: '#f3f3f1',
      },
      Dark: {
        bg: '#202123',
        surface: '#2b2c2f',
        surfaceAlt: '#32343a',
        sidebarSurface: 'rgba(23, 23, 24, 0.98)',
        sidebarSurfaceStrong: '#171718',
      },
    } as const

    const accent = accentPalette[accountSettings.accentColor]
    const action = actionPalette[accountSettings.accentColor]
    const appearance = appearancePalette[accountSettings.appearance]

    root.dataset.appearance = accountSettings.appearance.toLowerCase()
    root.style.setProperty('--accent', accent.accent)
    root.style.setProperty('--accent-strong', accent.accentStrong)
    root.style.setProperty('--accent-warm', accent.accentWarm)
    root.style.setProperty('--accent-teal', accent.accentTeal)
    root.style.setProperty('--border', accent.border)
    root.style.setProperty('--accent-button-bg', action.bg)
    root.style.setProperty('--accent-button-hover', action.hover)
    root.style.setProperty('--accent-button-active', action.active)
    root.style.setProperty('--accent-button-border', action.border)
    root.style.setProperty('--accent-button-shadow', action.shadow)
    root.style.setProperty('--accent-button-shadow-hover', action.glow)
    root.style.setProperty('--accent-button-soft-bg', action.softBg)
    root.style.setProperty('--accent-button-soft-border', action.softBorder)
    root.style.setProperty('--accent-button-soft-text', action.softText)
    root.style.setProperty('--accent-button-soft-glow', action.softGlow)
    root.style.setProperty('--accent-button-gradient', action.gradient)
    root.style.setProperty('--accent-button-gradient-hover', action.gradientHover)
    root.style.setProperty('--accent-button-gradient-active', action.gradientActive)
    root.style.setProperty('--bg', appearance.bg)
    root.style.setProperty('--surface', appearance.surface)
    root.style.setProperty('--surface-alt', appearance.surfaceAlt)
    root.style.setProperty('--sidebar-surface', appearance.sidebarSurface)
    root.style.setProperty('--sidebar-surface-strong', appearance.sidebarSurfaceStrong)
    root.style.colorScheme = accountSettings.appearance === 'Dark' ? 'dark' : 'light'
  }, [accountSettings])

  const loadProjects = async () => {
    if (!canAccessNewTask) {
      setProjects([])
      setProjectsError('')
      setIsLoadingProjects(false)
      return
    }

    setIsLoadingProjects(true)
    setProjectsError('')
    try {
      const response = await requestApi('/api/projects')
      const payload = await parseApiResponse<ProjectListResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load projects.')
      }

      const nextProjects = Array.isArray(payload.projects)
        ? payload.projects
            .map((project) => normalizeSidebarProject(project))
            .filter((project): project is SidebarProject => project !== null)
        : []

      setProjects(nextProjects)
    } catch (error) {
      setProjects([])
      setProjectsError(error instanceof Error ? error.message : 'Failed to load projects.')
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const loadSidebarTasks = async () => {
    if (!canAccessNewTask) {
      setSidebarTasks([])
      setHasLoadedSidebarTasks(false)
      setSidebarTasksError('')
      setIsLoadingSidebarTasks(false)
      return
    }

    setIsLoadingSidebarTasks(true)
    setSidebarTasksError('')
    try {
      const response = await requestApi('/api/new-task/tasks')
      const payload = await parseApiResponse<TaskHistoryTasksResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load task list.')
      }

      setSidebarTasks(Array.isArray(payload.tasks) ? payload.tasks : [])
      setHasLoadedSidebarTasks(true)
    } catch (error) {
      setSidebarTasks([])
      setHasLoadedSidebarTasks(false)
      setSidebarTasksError(error instanceof Error ? error.message : 'Failed to load task list.')
    } finally {
      setIsLoadingSidebarTasks(false)
    }
  }

  const handleCollapseSidebar = () => {
    setIsAccountMenuOpen(false)
    setSidebarCollapsed(true)
  }

  const handleToggleAccountMenu = () => {
    updateAccountMenuPosition()
    setProjectMenuOpenName('')
    setTaskMenuOpenKey('')
    setIsAccountMenuOpen((open) => !open)
  }

  const handleSelectSearchTask = (_task: SearchTaskItem) => {
    if (!canAccessNewTask) {
      return
    }

    setActiveProjectName('')
    setActiveView('predict')
    setIsSearchModalOpen(false)
    setNavOpen(false)
  }

  const handleCreateProject = async (rawProjectName: string, rawNotes: string) => {
    const projectName = rawProjectName.trim()
    const notes = rawNotes.trim()
    if (!projectName) {
      setProjectCreateError('Project name is required.')
      return
    }

    setIsCreatingProject(true)
    setProjectCreateError('')
    try {
      const response = await requestApi('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName,
          notes,
        }),
      })
      const payload = await parseApiResponse<ProjectMutationResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to create project.')
      }

      const createdProject = normalizeSidebarProject(payload.project)
      const createdProjectName = createdProject?.name ?? projectName
      await loadProjects()
      setActiveProjectName(createdProjectName)
      setExpandedProjectNames((currentNames) =>
        currentNames.includes(createdProjectName) ? currentNames : [...currentNames, createdProjectName],
      )
      setActiveView('predict')
      setIsProjectCreateModalOpen(false)
      setNavOpen(false)
    } catch (error) {
      setProjectCreateError(error instanceof Error ? error.message : 'Failed to create project.')
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleToggleProjectPinned = async (project: SidebarProject) => {
    setProjectPinningName(project.name)
    setProjectsError('')
    try {
      const response = await requestApi(`/api/projects/${encodeURIComponent(project.name)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pinned: !project.pinned,
        }),
      })
      const payload = await parseApiResponse<ProjectMutationResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to update project pin status.')
      }

      await loadProjects()
      setProjectMenuOpenName('')
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : 'Failed to update project pin status.')
    } finally {
      setProjectPinningName('')
    }
  }

  const handleUpdateProject = async (rawProjectName: string, rawNotes: string) => {
    if (!editingProject) {
      return
    }

    const nextProjectName = rawProjectName.trim()
    const nextNotes = rawNotes.trim()
    if (!nextProjectName) {
      setProjectUpdateError('Project name is required.')
      return
    }

    setIsUpdatingProject(true)
    setProjectUpdateError('')
    try {
      const response = await requestApi(`/api/projects/${encodeURIComponent(editingProject.name)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: nextProjectName,
          notes: nextNotes,
        }),
      })
      const payload = await parseApiResponse<ProjectMutationResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to update project.')
      }

      const updatedProject = normalizeSidebarProject(payload.project)
      const resolvedProjectName = updatedProject?.name ?? nextProjectName
      const didRename = editingProject.name !== resolvedProjectName

      await Promise.all([loadProjects(), didRename ? loadSidebarTasks() : Promise.resolve()])
      if (activeProjectName === editingProject.name) {
        setActiveProjectName(resolvedProjectName)
      }
      if (didRename) {
        setExpandedProjectNames((currentNames) =>
          currentNames.map((name) => (name === editingProject.name ? resolvedProjectName : name)),
        )
        if (selectedSidebarTask?.projectName === editingProject.name) {
          setSelectedSidebarTask(null)
        }
      }

      setEditingProject(null)
      setProjectMenuOpenName('')
    } catch (error) {
      setProjectUpdateError(error instanceof Error ? error.message : 'Failed to update project.')
    } finally {
      setIsUpdatingProject(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!deletingProject) {
      return
    }

    setIsDeletingProject(true)
    setProjectDeleteError('')
    try {
      const response = await requestApi(`/api/projects/${encodeURIComponent(deletingProject.name)}`, {
        method: 'DELETE',
      })
      const payload = await parseApiResponse<{ message?: string }>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to delete project.')
      }

      await Promise.all([loadProjects(), loadSidebarTasks()])
      if (activeProjectName === deletingProject.name) {
        setActiveProjectName('')
      }
      if (selectedSidebarTask?.projectName === deletingProject.name) {
        setSelectedSidebarTask(null)
      }
      setExpandedProjectNames((currentNames) => currentNames.filter((name) => name !== deletingProject.name))
      setDeletingProject(null)
      setProjectMenuOpenName('')
    } catch (error) {
      setProjectDeleteError(error instanceof Error ? error.message : 'Failed to delete project.')
    } finally {
      setIsDeletingProject(false)
    }
  }

  const handleUpdateTask = async (
    task: SearchTaskItem,
    payload: {
      taskName?: string
      targetProjectName?: string
      pinned?: boolean
      archived?: boolean
    },
    fallbackErrorMessage: string,
  ) => {
    const taskMenuKey = buildTaskMenuKey(task)
    setTaskTogglingKey(taskMenuKey)
    setSidebarTasksError('')
    try {
      const response = await requestApi(`/api/new-task/tasks/${encodeURIComponent(task.fileName)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          projectName: task.projectName ?? '',
        }),
      })
      const result = await parseApiResponse<TaskMutationResponse>(response)
      if (!response.ok) {
        throw new Error(result.message ?? fallbackErrorMessage)
      }

      await Promise.all([loadSidebarTasks(), loadProjects()])
      if (selectedSidebarTask && buildTaskMenuKey(selectedSidebarTask) === taskMenuKey) {
        if (payload.targetProjectName !== undefined) {
          setSelectedSidebarTask({
            ...selectedSidebarTask,
            projectName: payload.targetProjectName,
          })
        }
        if (payload.taskName !== undefined) {
          setSelectedSidebarTask((currentTask) =>
            currentTask
              ? {
                  ...currentTask,
                  taskName: payload.taskName ?? currentTask.taskName,
                }
              : currentTask,
          )
        }
      }
      if (payload.archived === true) {
        setArchivedTasksOpen(true)
      }
      setTaskMenuOpenKey('')
    } catch (error) {
      setSidebarTasksError(error instanceof Error ? error.message : fallbackErrorMessage)
      throw error
    } finally {
      setTaskTogglingKey('')
    }
  }

  const handleRenameTask = async (rawTaskName: string) => {
    if (!editingTask) {
      return
    }

    const nextTaskName = rawTaskName.trim()
    if (!nextTaskName) {
      setTaskUpdateError('Task name is required.')
      return
    }

    setIsUpdatingTask(true)
    setTaskUpdateError('')
    try {
      await handleUpdateTask(
        editingTask,
        {
          taskName: nextTaskName,
        },
        'Failed to rename task.',
      )
      setEditingTask(null)
    } catch (error) {
      setTaskUpdateError(error instanceof Error ? error.message : 'Failed to rename task.')
    } finally {
      setIsUpdatingTask(false)
    }
  }

  const handleMoveTask = async (targetProjectName: string) => {
    if (!movingTask) {
      return
    }

    setIsUpdatingTask(true)
    setTaskUpdateError('')
    try {
      await handleUpdateTask(
        movingTask,
        {
          targetProjectName,
        },
        'Failed to move task.',
      )
      if (activeProjectName === (movingTask.projectName ?? '')) {
        setSelectedSidebarTask(null)
      }
      setMovingTask(null)
    } catch (error) {
      setTaskUpdateError(error instanceof Error ? error.message : 'Failed to move task.')
    } finally {
      setIsUpdatingTask(false)
    }
  }

  const handleToggleTaskPinned = async (task: SearchTaskItem) => {
    await handleUpdateTask(
      task,
      {
        pinned: task.pinned !== true,
      },
      'Failed to update task pin status.',
    )
  }

  const handleToggleTaskArchived = async (task: SearchTaskItem) => {
    await handleUpdateTask(
      task,
      {
        archived: task.archived !== true,
        pinned: task.archived === true ? task.pinned === true : false,
      },
      task.archived === true ? 'Failed to restore task.' : 'Failed to archive task.',
    )
  }

  const handleDeleteTask = async () => {
    if (!deletingTask) {
      return
    }

    setIsDeletingTask(true)
    setTaskDeleteError('')
    try {
      const response = await requestApi(
        `/api/new-task/tasks/${encodeURIComponent(deletingTask.fileName)}?projectName=${encodeURIComponent(
          deletingTask.projectName ?? '',
        )}`,
        {
          method: 'DELETE',
        },
      )
      const payload = await parseApiResponse<{ message?: string }>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to delete task.')
      }

      await Promise.all([loadSidebarTasks(), loadProjects()])
      if (selectedSidebarTask && buildTaskMenuKey(selectedSidebarTask) === buildTaskMenuKey(deletingTask)) {
        setSelectedSidebarTask(null)
      }
      setDeletingTask(null)
      setTaskMenuOpenKey('')
    } catch (error) {
      setTaskDeleteError(error instanceof Error ? error.message : 'Failed to delete task.')
    } finally {
      setIsDeletingTask(false)
    }
  }

  const handleSelectProject = (projectName: string) => {
    if (!canAccessNewTask) {
      return
    }

    const willExpand = !expandedProjectNames.includes(projectName)
    setActiveProjectName(projectName)
    setProjectMenuOpenName('')
    setTaskMenuOpenKey('')
    setExpandedProjectNames((currentNames) =>
      willExpand ? [...currentNames, projectName] : currentNames.filter((name) => name !== projectName),
    )
    setActiveView('predict')
    setNavOpen(false)
    if (willExpand && !hasLoadedSidebarTasks && !isLoadingSidebarTasks) {
      void loadSidebarTasks()
    }
  }

  useEffect(() => {
    setExpandedProjectNames((currentNames) => currentNames.filter((name) => projects.some((project) => project.name === name)))
  }, [projects])

  useEffect(() => {
    setProjectMenuOpenName((currentName) =>
      currentName && projects.some((project) => project.name === currentName) ? currentName : '',
    )
  }, [projects])

  useEffect(() => {
    if (!taskMenuOpenKey) {
      setTaskMenuOpenInstanceId('')
      setTaskMenuAnchorTask(null)
      return
    }

    const matchingTask = sidebarTasks.find((task) => buildTaskMenuKey(task) === taskMenuOpenKey) ?? null
    if (!matchingTask) {
      closeTaskMenu()
      return
    }

    setTaskMenuAnchorTask(matchingTask)
  }, [sidebarTasks, taskMenuOpenKey])

  const closeTaskMenu = () => {
    setTaskMenuOpenKey('')
    setTaskMenuOpenInstanceId('')
    setTaskMenuAnchorTask(null)
  }

  const getEstimatedTaskMenuHeight = (task: SearchTaskItem | null) => {
    const actionCount = task?.archived === true ? 4 : 5
    return actionCount * 42 + 16
  }

  const updateTaskMenuPosition = () => {
    if (!taskMenuOpenKey || !taskMenuOpenInstanceId) {
      return
    }

    const trigger = taskMenuTriggerRefs.current[taskMenuOpenInstanceId]
    if (!trigger) {
      closeTaskMenu()
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const measuredMenuHeight = taskMenuPopoverRef.current?.offsetHeight ?? getEstimatedTaskMenuHeight(taskMenuAnchorTask)
    const availableBelow = window.innerHeight - triggerRect.bottom - SIDEBAR_MENU_VIEWPORT_PADDING - SIDEBAR_MENU_OFFSET
    const availableAbove = triggerRect.top - SIDEBAR_MENU_VIEWPORT_PADDING - SIDEBAR_MENU_OFFSET
    const shouldOpenUpward = availableBelow < measuredMenuHeight && availableAbove > availableBelow
    const maxHeight = Math.max(140, shouldOpenUpward ? availableAbove : availableBelow)
    const top = shouldOpenUpward
      ? Math.max(
          SIDEBAR_MENU_VIEWPORT_PADDING,
          triggerRect.top - Math.min(measuredMenuHeight, maxHeight) - SIDEBAR_MENU_OFFSET,
        )
      : Math.min(
          window.innerHeight - Math.min(measuredMenuHeight, maxHeight) - SIDEBAR_MENU_VIEWPORT_PADDING,
          triggerRect.bottom + SIDEBAR_MENU_OFFSET,
        )
    const left = Math.min(
      window.innerWidth - SIDEBAR_MENU_WIDTH - SIDEBAR_MENU_VIEWPORT_PADDING,
      Math.max(SIDEBAR_MENU_VIEWPORT_PADDING, triggerRect.right - SIDEBAR_MENU_WIDTH),
    )

    setTaskMenuPosition({
      top,
      left,
      maxHeight,
    })
  }

  useEffect(() => {
    if (projectsOpen && canAccessNewTask) {
      void loadProjects()
      return
    }

    setProjects([])
    setProjectsError('')
  }, [canAccessNewTask, projectsOpen])

  useEffect(() => {
    if ((tasksOpen || archivedTasksOpen) && canAccessNewTask) {
      void loadSidebarTasks()
      return
    }

    setSidebarTasks([])
    setHasLoadedSidebarTasks(false)
    setSidebarTasksError('')
  }, [archivedTasksOpen, canAccessNewTask, tasksOpen])

  useEffect(() => {
    const handleTaskHistoryUpdated = () => {
      if (!canAccessNewTask) {
        return
      }

      void loadSidebarTasks()
      void loadProjects()
    }

    window.addEventListener('bp:task-history-updated', handleTaskHistoryUpdated)
    return () => {
      window.removeEventListener('bp:task-history-updated', handleTaskHistoryUpdated)
    }
  }, [canAccessNewTask])

  useEffect(() => {
    if ((activeView === 'model' && !canAccessLibrary) || (activeView === 'predict' && !canAccessNewTask) || (activeView === 'explain' && !canAccessExplore)) {
      setActiveView('home')
    }
  }, [activeView, canAccessExplore, canAccessLibrary, canAccessNewTask])

  useEffect(() => {
    if (!canAccessNewTask) {
      setActiveProjectName('')
      setIsSearchModalOpen(false)
      setSelectedSidebarTask(null)
      setProjectMenuOpenName('')
      closeTaskMenu()
    }
  }, [canAccessNewTask])

  useEffect(() => {
    if (!projectMenuOpenName) {
      return
    }

    const handleDocumentClick = () => {
      setProjectMenuOpenName('')
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProjectMenuOpenName('')
      }
    }

    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [projectMenuOpenName])

  useEffect(() => {
    if (!taskMenuOpenKey || !taskMenuOpenInstanceId) {
      return
    }

    updateTaskMenuPosition()
    const frameId = window.requestAnimationFrame(() => {
      updateTaskMenuPosition()
    })

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const trigger = taskMenuTriggerRefs.current[taskMenuOpenInstanceId]
      if (trigger?.contains(target) || taskMenuPopoverRef.current?.contains(target)) {
        return
      }

      closeTaskMenu()
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTaskMenu()
      }
    }
    const handleViewportUpdate = () => {
      updateTaskMenuPosition()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleViewportUpdate)
    window.addEventListener('scroll', handleViewportUpdate, true)
    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleViewportUpdate)
      window.removeEventListener('scroll', handleViewportUpdate, true)
    }
  }, [taskMenuAnchorTask, taskMenuOpenInstanceId, taskMenuOpenKey])

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return
    }

    updateAccountMenuPosition()

    const handleDocumentClick = () => {
      setIsAccountMenuOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false)
      }
    }
    const handleViewportUpdate = () => {
      updateAccountMenuPosition()
    }

    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleViewportUpdate)
    window.addEventListener('scroll', handleViewportUpdate, true)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleViewportUpdate)
      window.removeEventListener('scroll', handleViewportUpdate, true)
    }
  }, [isAccountMenuOpen, navOpen, sidebarCollapsed])

  const renderTaskItem = (
    task: SearchTaskItem,
    options?: {
      compactMeta?: boolean
      className?: string
      instanceId?: string
    },
  ) => {
    const taskMenuKey = buildTaskMenuKey(task)
    const taskMenuInstanceId = options?.instanceId ?? `${task.archived === true ? 'archived' : 'all'}:${taskMenuKey}`
    const isTaskMenuOpen = taskMenuOpenKey === taskMenuKey && taskMenuOpenInstanceId === taskMenuInstanceId
    const isTaskPinned = task.pinned === true && task.archived !== true
    const isTaskArchived = task.archived === true
    const isTogglingTask = taskTogglingKey === taskMenuKey
    const rowClassName = options?.className
      ? `sidebar-subitem sidebar-subitem--task ${options.className}`
      : 'sidebar-subitem sidebar-subitem--task'
    const taskMenuPortal =
      isTaskMenuOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={taskMenuPopoverRef}
              className="sidebar-project-menu sidebar-project-menu--floating sidebar-project-menu--task"
              role="menu"
              aria-label={`${task.taskName} actions`}
              style={{
                top: `${taskMenuPosition.top}px`,
                left: `${taskMenuPosition.left}px`,
                width: `${SIDEBAR_MENU_WIDTH}px`,
                maxHeight: `${taskMenuPosition.maxHeight}px`,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="sidebar-project-menu__item"
                onClick={() => {
                  setTaskUpdateError('')
                  setEditingTask(task)
                  closeTaskMenu()
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 20h4l10-10a2.3 2.3 0 0 0-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.5 6.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Rename</span>
              </button>
              <button
                type="button"
                className="sidebar-project-menu__item"
                onClick={() => {
                  setTaskUpdateError('')
                  setMovingTask(task)
                  closeTaskMenu()
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M3.5 7.5a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Move to project</span>
              </button>
              {!isTaskArchived ? (
                <button
                  type="button"
                  className="sidebar-project-menu__item"
                  onClick={() => void handleToggleTaskPinned(task)}
                  disabled={isTogglingTask}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M15 4l5 5-2 2-2.4-.6-3.5 3.5 1 5-1.8 1.8-3.1-5.1-3.1-3.1 1.8-1.8 5 1 3.5-3.5L13 6l2-2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{isTogglingTask ? 'Saving...' : isTaskPinned ? 'Unpin' : 'Pin to top'}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="sidebar-project-menu__item"
                onClick={() => void handleToggleTaskArchived(task)}
                disabled={isTogglingTask}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="5" y="4.5" width="14" height="15" rx="2" />
                  <path d="M8.5 9h7" strokeLinecap="round" />
                  <path d="M9 13.5h6" strokeLinecap="round" />
                </svg>
                <span>{isTogglingTask ? 'Saving...' : isTaskArchived ? 'Restore' : 'Archive'}</span>
              </button>
              <button
                type="button"
                className="sidebar-project-menu__item sidebar-project-menu__item--danger"
                onClick={() => {
                  setTaskDeleteError('')
                  setDeletingTask(task)
                  closeTaskMenu()
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M5 7h14" strokeLinecap="round" />
                  <path d="M9 7V5h6v2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 11v5" strokeLinecap="round" />
                  <path d="M14 11v5" strokeLinecap="round" />
                </svg>
                <span>Delete</span>
              </button>
            </div>,
            document.body,
          )
        : null

    return (
      <div key={`${taskMenuKey}-${task.modifiedAt}`} className="sidebar-task-item">
        <button
          type="button"
          className={rowClassName}
          title={task.taskName}
          onClick={() => {
            setSelectedSidebarTask(task)
            setNavOpen(false)
            setTaskMenuOpenKey('')
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 12c0-4 3-7 8-7s8 3 8 7-3 7-8 7a8.6 8.6 0 0 1-3.7-.8L5 19l.8-3.2A6.8 6.8 0 0 1 4 12z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sidebar-subitem__text">
            <span className="sidebar-subitem__title">{task.taskName}</span>
            <span className="sidebar-subitem__meta">
              {!options?.compactMeta && task.projectName ? `${task.projectName} | ` : ''}
              {isTaskArchived ? 'Archived' : task.isMultiple ? 'Multiple tasks' : 'Single task'}
            </span>
          </span>
          {isTaskPinned ? (
            <svg className="sidebar-project__pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M15 4l5 5-2 2-2.4-.6-3.5 3.5 1 5-1.8 1.8-3.1-5.1-3.1-3.1 1.8-1.8 5 1 3.5-3.5L13 6l2-2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </button>

        <div className="sidebar-item-menu">
          <button
            ref={(node) => {
              if (node) {
                taskMenuTriggerRefs.current[taskMenuInstanceId] = node
                return
              }

              delete taskMenuTriggerRefs.current[taskMenuInstanceId]
            }}
            type="button"
            className={`sidebar-project-item__menu-trigger ${isTaskMenuOpen ? 'is-open' : ''}`}
            aria-label={`Manage ${task.taskName}`}
            aria-expanded={isTaskMenuOpen}
            title={`Manage ${task.taskName}`}
            onClick={(event) => {
              event.stopPropagation()
              setProjectMenuOpenName('')
              if (isTaskMenuOpen) {
                closeTaskMenu()
                return
              }

              setTaskMenuOpenKey(taskMenuKey)
              setTaskMenuOpenInstanceId(taskMenuInstanceId)
              setTaskMenuAnchorTask(task)
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="6" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="18" cy="12" r="1.8" />
            </svg>
          </button>
        </div>
        {taskMenuPortal}
      </div>
    )
  }

  const renderProjectTaskList = (projectName: string) => {
    const projectTasks = projectTasksByName.get(projectName) ?? []
    if (!expandedProjectNames.includes(projectName)) {
      return null
    }

    return (
      <div className="sidebar-project-tasks">
        {isLoadingSidebarTasks && !hasLoadedSidebarTasks ? (
          <div className="sidebar-section__empty">Loading tasks...</div>
        ) : sidebarTasksError ? (
          <div className="sidebar-section__empty sidebar-section__empty--error">{sidebarTasksError}</div>
        ) : projectTasks.length > 0 ? (
          projectTasks.map((task) =>
            renderTaskItem(task, {
              compactMeta: true,
              className: 'sidebar-subitem--project-task',
              instanceId: `project:${projectName}:${buildTaskMenuKey(task)}`,
            }),
          )
        ) : (
          <div className="sidebar-section__empty">No executed tasks in this project yet.</div>
        )}
      </div>
    )
  }

  const renderProjectItem = (project: SidebarProject) => {
    const isProjectMenuOpen = projectMenuOpenName === project.name
    const isProjectPinned = project.pinned
    const isPinningProject = projectPinningName === project.name

    return (
      <div key={project.id} className="sidebar-project-group">
        <div className="sidebar-project-item">
          <button
            type="button"
            className={`sidebar-subitem sidebar-subitem--project ${
              activeView === 'predict' && activeProjectName === project.name ? 'sidebar-subitem--active' : ''
            }`}
            aria-expanded={expandedProjectNames.includes(project.name)}
            title={project.notes ? `${project.name}\n${project.notes}` : project.name}
            onClick={() => handleSelectProject(project.name)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3.5 7.5a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sidebar-subitem__text">
              <span className="sidebar-subitem__title">{project.name}</span>
              <span className="sidebar-subitem__meta">{project.taskCount} saved tasks</span>
            </span>
            {isProjectPinned ? (
              <svg className="sidebar-project__pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M15 4l5 5-2 2-2.4-.6-3.5 3.5 1 5-1.8 1.8-3.1-5.1-3.1-3.1 1.8-1.8 5 1 3.5-3.5L13 6l2-2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
            <svg
              className={`sidebar-project__chevron ${expandedProjectNames.includes(project.name) ? 'is-open' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="sidebar-item-menu">
            <button
              type="button"
              className={`sidebar-project-item__menu-trigger ${isProjectMenuOpen ? 'is-open' : ''}`}
              aria-label={`Manage ${project.name}`}
              aria-expanded={isProjectMenuOpen}
              title={`Manage ${project.name}`}
              onClick={(event) => {
                event.stopPropagation()
                setTaskMenuOpenKey('')
                setProjectMenuOpenName((currentName) => (currentName === project.name ? '' : project.name))
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="6" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="18" cy="12" r="1.8" />
              </svg>
            </button>

            {isProjectMenuOpen ? (
              <div
                className="sidebar-project-menu"
                role="menu"
                aria-label={`${project.name} actions`}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="sidebar-project-menu__item"
                  onClick={() => void handleToggleProjectPinned(project)}
                  disabled={isPinningProject}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M15 4l5 5-2 2-2.4-.6-3.5 3.5 1 5-1.8 1.8-3.1-5.1-3.1-3.1 1.8-1.8 5 1 3.5-3.5L13 6l2-2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{isPinningProject ? 'Saving...' : isProjectPinned ? 'Unpin' : 'Pin to top'}</span>
                </button>
                <button
                  type="button"
                  className="sidebar-project-menu__item"
                  onClick={() => {
                    setProjectUpdateError('')
                    setEditingProject(project)
                    setProjectMenuOpenName('')
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M4 20h4l10-10a2.3 2.3 0 0 0-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13.5 6.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  className="sidebar-project-menu__item sidebar-project-menu__item--danger"
                  onClick={() => {
                    setProjectDeleteError('')
                    setDeletingProject(project)
                    setProjectMenuOpenName('')
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M5 7h14" strokeLinecap="round" />
                    <path d="M9 7V5h6v2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 11v5" strokeLinecap="round" />
                    <path d="M14 11v5" strokeLinecap="round" />
                  </svg>
                  <span>Delete</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {renderProjectTaskList(project.name)}
      </div>
    )
  }

  const mainContent =
    activeView === 'predict' ? (
      <NewTaskPage
        key={activeProjectName || '__root_new_task__'}
        pageTitle={activeProjectName || 'New task'}
        projectName={activeProjectName}
      />
    ) : (
      viewMeta[activeView].component
    )

  const accountMenuPortal =
    isAccountMenuOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="sidebar__account-popover"
            style={{
              left: `${accountMenuPosition.left}px`,
              bottom: `${accountMenuPosition.bottom}px`,
              width: `${accountMenuPosition.width}px`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sidebar__account-menu" role="menu" aria-label="Account menu">
              <div className="sidebar__account-menu-card">
                <div className="sidebar__account-menu-header">
                  {accountProfile.avatarDataUrl ? (
                    <img
                      className="sidebar__account-avatar-image sidebar__account-avatar-image--large"
                      src={accountProfile.avatarDataUrl}
                      alt={`${accountProfile.displayName} avatar`}
                    />
                  ) : (
                    <span className="sidebar__account-avatar sidebar__account-avatar--large" aria-hidden="true">
                      {accountInitials}
                    </span>
                  )}
                  <div className="sidebar__account-menu-copy">
                    <div className="sidebar__account-menu-title" title={accountProfile.displayName}>
                      {accountProfile.displayName}
                    </div>
                    <div className="sidebar__account-menu-subtitle">{`@${accountProfile.username}`}</div>
                    <div className="sidebar__account-menu-caption" title={currentUser.email}>
                      {currentUser.email}
                    </div>
                  </div>
                </div>

                <div className="sidebar__account-menu-divider" />

                <button
                  type="button"
                  className="sidebar__account-menu-item"
                  onClick={() => {
                    setIsAccountMenuOpen(false)
                    setIsProfileModalOpen(true)
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
                  </svg>
                  <span>Profile</span>
                </button>

                <button
                  type="button"
                  className="sidebar__account-menu-item"
                  onClick={() => {
                    setIsAccountMenuOpen(false)
                    setIsSettingsModalOpen(true)
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="3.2" />
                    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 1 1-3.6 0v-.2a1 1 0 0 0-.7-1 1 1 0 0 0-1 .2l-.2.1a1.8 1.8 0 0 1-2.4-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 1 1 0-3.6h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1l-.1-.2a1.8 1.8 0 0 1 2.5-2.4l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 1 1 3.6 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1-.2l.2-.1a1.8 1.8 0 0 1 2.4 2.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 1 1 0 3.6h-.2a1 1 0 0 0-1 .7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Settings</span>
                </button>

                <button type="button" className="sidebar__account-menu-item sidebar__account-menu-item--disabled" disabled>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M9.1 9a3.2 3.2 0 1 1 5.6 2.1c-.7.8-1.2 1.3-1.2 2.4" strokeLinecap="round" />
                    <circle cx="12" cy="17.2" r=".8" fill="currentColor" stroke="none" />
                  </svg>
                  <span>Help</span>
                  <span className="sidebar__account-menu-meta">Soon</span>
                </button>

                <div className="sidebar__account-menu-divider" />

                <button
                  type="button"
                  className="sidebar__account-menu-item sidebar__account-menu-item--danger"
                  onClick={() => {
                    setIsAccountMenuOpen(false)
                    void onSignOut()
                  }}
                  disabled={isSigningOut}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M10 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4" strokeLinecap="round" />
                    <path d="M14 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M18 12H9" strokeLinecap="round" />
                  </svg>
                  <span>{isSigningOut ? 'Signing out...' : 'Log out'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'app-shell--collapsed' : ''}`}>
      <div className="ambient-orbs" aria-hidden="true">
        <span className="orb orb--one" />
        <span className="orb orb--two" />
        <span className="orb orb--three" />
      </div>

      <aside
        id="sidebar"
        className={`sidebar ${navOpen ? 'sidebar--open' : ''} ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}
      >
        <div className="sidebar__brand">
          <button
            type="button"
            className={`sidebar__brand-main ${sidebarCollapsed ? 'sidebar__brand-main--interactive' : ''}`}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : undefined}
            title={sidebarCollapsed ? 'Expand sidebar' : undefined}
            tabIndex={sidebarCollapsed ? 0 : -1}
            onClick={sidebarCollapsed ? () => setSidebarCollapsed(false) : undefined}
          >
            <img className="logo-mark" src="/Logo1.png" alt="CushionPack Studio logo" />
            <div className="sidebar__brand-text">
              <div className="sidebar__title">CushionPack Studio</div>
            </div>
          </button>
          <button
            type="button"
            className="sidebar__collapse"
            aria-label="Collapse sidebar"
            aria-hidden={sidebarCollapsed}
            aria-pressed={false}
            title="Collapse sidebar"
            tabIndex={sidebarCollapsed ? -1 : 0}
            onClick={handleCollapseSidebar}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <nav className="sidebar__nav">
          <div className="nav-stack">
            {visibleNavItems.map((item) => (
              <Fragment key={item.id}>
                <button
                  type="button"
                  className={`nav-button ${activeView === item.id ? 'active' : ''}`}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  aria-current={activeView === item.id ? 'page' : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => {
                    setActiveView(item.id)
                    setIsAccountMenuOpen(false)
                    if (item.id === 'predict') {
                      setActiveProjectName('')
                    }
                    setNavOpen(false)
                  }}
                >
                  {item.icon}
                  <span className="nav-button__label">{item.label}</span>
                </button>

                {item.id === 'predict' && canAccessNewTask ? (
                  <button
                    type="button"
                    className="nav-button"
                    aria-label={sidebarCollapsed ? searchNavItem.label : undefined}
                    title={sidebarCollapsed ? searchNavItem.label : undefined}
                    onClick={() => {
                      setIsSearchModalOpen(true)
                      setIsAccountMenuOpen(false)
                      setNavOpen(false)
                    }}
                  >
                    {searchNavItem.icon}
                    <span className="nav-button__label">{searchNavItem.label}</span>
                  </button>
                ) : null}
              </Fragment>
            ))}
          </div>

          {!sidebarCollapsed && canAccessNewTask ? (
            <div className="sidebar-sections">
              <section className={`sidebar-section ${projectsOpen ? 'is-open' : ''}`}>
                <div className="sidebar-section__header-row">
                  <button
                    type="button"
                    className="sidebar-section__header sidebar-section__header--split"
                    aria-expanded={projectsOpen}
                    onClick={() => setProjectsOpen((open) => !open)}
                  >
                    <span className="sidebar-section__title-group">
                      <span className="sidebar-section__title">Projects</span>
                      <svg
                        className="sidebar-section__chevron"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-section__action"
                    aria-label="New project"
                    title="New project"
                    onClick={() => {
                      setProjectMenuOpenName('')
                      setTaskMenuOpenKey('')
                      setIsAccountMenuOpen(false)
                      setProjectCreateError('')
                      setIsProjectCreateModalOpen(true)
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M12 5v14" strokeLinecap="round" />
                      <path d="M5 12h14" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {projectsOpen ? (
                  <div className="sidebar-section__body">
                    <div className="sidebar-section__list">
                      {isLoadingProjects ? (
                        <div className="sidebar-section__empty">Loading projects...</div>
                      ) : projectsError ? (
                        <div className="sidebar-section__empty sidebar-section__empty--error">{projectsError}</div>
                      ) : projects.length > 0 ? (
                        <>
                          {visibleProjects.map(renderProjectItem)}

                          {overflowProjects.length > 0 ? (
                            <div className="sidebar-more">
                              <button
                                type="button"
                                className={`sidebar-subitem sidebar-subitem--more ${moreProjectsOpen ? 'sidebar-subitem--active' : ''}`}
                                aria-expanded={moreProjectsOpen}
                                onClick={() => setMoreProjectsOpen((open) => !open)}
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <circle cx="6" cy="12" r="1.7" />
                                  <circle cx="12" cy="12" r="1.7" />
                                  <circle cx="18" cy="12" r="1.7" />
                                </svg>
                                <span className="sidebar-subitem__text">
                                  <span className="sidebar-subitem__title">More</span>
                                  <span className="sidebar-subitem__meta">{overflowProjects.length} hidden projects</span>
                                </span>
                                <svg
                                  className={`sidebar-more__chevron ${moreProjectsOpen ? 'is-open' : ''}`}
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  aria-hidden="true"
                                >
                                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>

                              {showOverflowProjects ? (
                                <div className="sidebar-more__list">{overflowProjects.map(renderProjectItem)}</div>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="sidebar-section__empty">No projects yet.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className={`sidebar-section ${tasksOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="sidebar-section__header sidebar-section__header--split"
                  aria-expanded={tasksOpen}
                  onClick={() => setTasksOpen((open) => !open)}
                >
                  <span className="sidebar-section__title-group">
                    <span className="sidebar-section__title">All tasks</span>
                    <svg
                      className="sidebar-section__chevron"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {tasksOpen ? (
                  <div className="sidebar-section__body">
                    <div className="sidebar-section__list">
                      {isLoadingSidebarTasks ? (
                        <div className="sidebar-section__empty">Loading tasks...</div>
                      ) : sidebarTasksError ? (
                        <div className="sidebar-section__empty sidebar-section__empty--error">{sidebarTasksError}</div>
                      ) : activeSidebarTasks.length > 0 ? (
                        activeSidebarTasks.map((task) =>
                          renderTaskItem(task, {
                            instanceId: `all:${buildTaskMenuKey(task)}`,
                          }),
                        )
                      ) : (
                        <div className="sidebar-section__empty">No executed tasks yet.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className={`sidebar-section ${archivedTasksOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="sidebar-section__header sidebar-section__header--split"
                  aria-expanded={archivedTasksOpen}
                  onClick={() => setArchivedTasksOpen((open) => !open)}
                >
                  <span className="sidebar-section__title-group">
                    <span className="sidebar-section__title">Archived tasks</span>
                    <svg
                      className="sidebar-section__chevron"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {archivedTasksOpen ? (
                  <div className="sidebar-section__body">
                    <div className="sidebar-section__list">
                      {isLoadingSidebarTasks ? (
                        <div className="sidebar-section__empty">Loading tasks...</div>
                      ) : sidebarTasksError ? (
                        <div className="sidebar-section__empty sidebar-section__empty--error">{sidebarTasksError}</div>
                      ) : archivedSidebarTasks.length > 0 ? (
                        archivedSidebarTasks.map((task) =>
                          renderTaskItem(task, {
                            instanceId: `archived:${buildTaskMenuKey(task)}`,
                          }),
                        )
                      ) : (
                        <div className="sidebar-section__empty">No archived tasks.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          <div className="sidebar__account">
            <button
              ref={accountTriggerRef}
              type="button"
              className={`sidebar__account-trigger ${isAccountMenuOpen ? 'is-open' : ''}`}
              aria-expanded={isAccountMenuOpen}
              aria-label={sidebarCollapsed ? 'Open account menu' : undefined}
              title={sidebarCollapsed ? accountProfile.displayName : 'Account'}
              onClick={(event) => {
                event.stopPropagation()
                handleToggleAccountMenu()
              }}
            >
              {accountProfile.avatarDataUrl ? (
                <img className="sidebar__account-avatar-image" src={accountProfile.avatarDataUrl} alt={`${accountProfile.displayName} avatar`} />
              ) : (
                <span className="sidebar__account-avatar" aria-hidden="true">
                  {accountInitials}
                </span>
              )}
              <span className="sidebar__account-meta">
                <span className="sidebar__account-title" title={accountProfile.displayName}>
                  {accountProfile.displayName}
                </span>
                <span className="sidebar__account-subtitle">{`@${accountProfile.username}`}</span>
              </span>
              <svg
                className={`sidebar__account-chevron ${isAccountMenuOpen ? 'is-open' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </nav>
      </aside>

      <main className="main">
        <header className={`main-header ${isHomeView ? 'main-header--home' : 'main-header--compact'}`}>
          <button
            type="button"
            className="menu-toggle"
            aria-controls="sidebar"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            Menu
          </button>
        </header>

        <section className={`main-content ${isHomeView ? 'main-content--home' : ''}`}>{mainContent}</section>
      </main>

      {accountMenuPortal}

      <SearchModal
        open={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectTask={handleSelectSearchTask}
      />
      <AccountProfileModal
        open={isProfileModalOpen}
        email={currentUser.email}
        profile={accountProfile}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
      />
      <AccountSettingsModal
        open={isSettingsModalOpen}
        settings={accountSettings}
        onClose={() => setIsSettingsModalOpen(false)}
        onChange={handleChangeSettings}
      />
      <TaskHistoryDetailModal
        open={Boolean(selectedSidebarTask)}
        task={selectedSidebarTask}
        onClose={() => setSelectedSidebarTask(null)}
      />
      <ProjectCreateModal
        open={isProjectCreateModalOpen}
        mode="create"
        isSubmitting={isCreatingProject}
        error={projectCreateError}
        onClose={() => {
          if (isCreatingProject) {
            return
          }
          setProjectCreateError('')
          setIsProjectCreateModalOpen(false)
        }}
        onSubmit={handleCreateProject}
      />
      <ProjectCreateModal
        open={Boolean(editingProject)}
        mode="edit"
        isSubmitting={isUpdatingProject}
        error={projectUpdateError}
        initialProjectName={editingProject?.name ?? ''}
        initialNote={editingProject?.notes ?? ''}
        onClose={() => {
          if (isUpdatingProject) {
            return
          }
          setProjectUpdateError('')
          setEditingProject(null)
        }}
        onSubmit={handleUpdateProject}
      />
      <ProjectDeleteModal
        open={Boolean(deletingProject)}
        projectName={deletingProject?.name ?? ''}
        isSubmitting={isDeletingProject}
        error={projectDeleteError}
        onClose={() => {
          if (isDeletingProject) {
            return
          }
          setProjectDeleteError('')
          setDeletingProject(null)
        }}
        onConfirm={() => void handleDeleteProject()}
      />
      <TaskManageModal
        open={Boolean(editingTask)}
        mode="rename"
        task={editingTask}
        projects={projects}
        isSubmitting={isUpdatingTask}
        error={taskUpdateError}
        onClose={() => {
          if (isUpdatingTask) {
            return
          }
          setTaskUpdateError('')
          setEditingTask(null)
        }}
        onSubmit={({ taskName }) => void handleRenameTask(taskName)}
      />
      <TaskManageModal
        open={Boolean(movingTask)}
        mode="move"
        task={movingTask}
        projects={projects}
        isSubmitting={isUpdatingTask}
        error={taskUpdateError}
        onClose={() => {
          if (isUpdatingTask) {
            return
          }
          setTaskUpdateError('')
          setMovingTask(null)
        }}
        onSubmit={({ targetProjectName }) => void handleMoveTask(targetProjectName)}
      />
      <TaskDeleteModal
        open={Boolean(deletingTask)}
        task={deletingTask}
        isSubmitting={isDeletingTask}
        error={taskDeleteError}
        onClose={() => {
          if (isDeletingTask) {
            return
          }
          setTaskDeleteError('')
          setDeletingTask(null)
        }}
        onConfirm={() => void handleDeleteTask()}
      />
    </div>
  )
}

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authError, setAuthError] = useState('')
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const applyAuthenticatedUser = (user: AuthUser, token: string) => {
    const normalizedToken = String(token ?? '').trim()
    if (normalizedToken) {
      writeStoredAuthSession({
        token: normalizedToken,
        user,
      })
    }

    setCurrentUser(user)
    setAuthError('')
    setAuthStatus('authenticated')
  }

  const refreshCurrentUser = async (options?: { apply?: boolean }) => {
    const storedSession = readStoredAuthSession()
    if (!storedSession) {
      throw new Error('Session is invalid or expired.')
    }

    const response = await requestApi('/api/auth/session')
    const payload = await parseApiResponse<AuthResponse>(response)
    if (!response.ok) {
      throw new Error(payload.message ?? 'Session is invalid or expired.')
    }

    const user = normalizeAuthUser(payload.user)
    if (!user) {
      throw new Error('Session payload is invalid.')
    }

    if (options?.apply !== false) {
      applyAuthenticatedUser(user, storedSession.token)
    }
    return user
  }

  useEffect(() => {
    let disposed = false

    const restoreSession = async () => {
      const storedSession = readStoredAuthSession()
      if (!storedSession) {
        if (!disposed) {
          setAuthStatus('unauthenticated')
        }
        return
      }

      try {
        const user = await refreshCurrentUser({ apply: false })
        if (!disposed) {
          applyAuthenticatedUser(user, storedSession.token)
        }
      } catch (error) {
        clearStoredAuthSession()
        if (!disposed) {
          setCurrentUser(null)
          setAuthStatus('unauthenticated')
          setAuthError(error instanceof Error ? error.message : 'Session is invalid or expired.')
        }
      }
    }

    void restoreSession()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const handleAuthExpired = () => {
      setCurrentUser(null)
      setAuthStatus('unauthenticated')
      setAuthError('Your session expired. Please sign in again.')
      setIsAuthSubmitting(false)
      setIsSigningOut(false)
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [])

  const handleAuthenticate = async ({
    mode,
    email,
    password,
  }: {
    mode: 'sign-in' | 'sign-up'
    email: string
    password: string
  }) => {
    setIsAuthSubmitting(true)
    setAuthError('')

    try {
      const response = await requestApi(mode === 'sign-up' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })
      const payload = await parseApiResponse<AuthResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? (mode === 'sign-up' ? 'Failed to register.' : 'Failed to sign in.'))
      }

      const token = String(payload.token ?? '').trim()
      const user = normalizeAuthUser(payload.user)
      if (!token || !user) {
        throw new Error('Authentication response is invalid.')
      }

      applyAuthenticatedUser(user, token)
    } catch (error) {
      clearStoredAuthSession()
      setCurrentUser(null)
      setAuthStatus('unauthenticated')
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      const response = await requestApi('/api/auth/logout', {
        method: 'POST',
      })
      await parseApiResponse<AuthResponse>(response)
    } catch {
      // Clear local session even if backend logout fails.
    } finally {
      clearStoredAuthSession()
      setCurrentUser(null)
      setAuthError('')
      setAuthStatus('unauthenticated')
      setIsSigningOut(false)
    }
  }

  if (authStatus !== 'authenticated' || !currentUser) {
    return (
      <AuthScreen
        error={authError}
        isChecking={authStatus === 'checking'}
        isSubmitting={isAuthSubmitting}
        onClearError={() => setAuthError('')}
        onAuthenticate={handleAuthenticate}
      />
    )
  }

  return (
    <StudioApp
      currentUser={currentUser}
      isSigningOut={isSigningOut}
      onSignOut={handleSignOut}
    />
  )
}

export default App
