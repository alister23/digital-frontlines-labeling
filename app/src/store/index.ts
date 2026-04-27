import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import type { Page, Task, Datapoint, Labels, LabelValue, ViewMode, ExportedSession, Profile } from '../types'
import { supabase, hasSupabase } from '../lib/supabase'
import {
  dbUpsertTask, dbDeleteTask, dbFetchTasks,
  dbGetProfile, dbGetDataset, dbGetProgress, dbSaveProgress,
} from '../lib/db'

let saveProgressTimer: ReturnType<typeof setTimeout> | null = null

interface Store {
  // Auth
  user: User | null
  profile: Profile | null
  authLoading: boolean
  initAuth: () => (() => void)
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>

  page: Page
  tasks: Task[]
  editingTaskId: string | null

  currentTaskId: string | null
  datapoints: Datapoint[]
  labels: Labels
  currentIndex: number
  viewMode: ViewMode

  // Admin mode — true when profile.isAdmin, or when Supabase not configured (dev mode)
  adminMode: boolean

  // Google Drive settings (persisted)
  googleClientId: string
  driveImagesFolderId: string
  driveMessagesFolderId: string
  defaultMessagesFolderId: string

  driveToken: string | null

  // Nav
  navigate: (page: Page) => void

  // Tasks
  saveTask: (task: Task) => void
  deleteTask: (id: string) => void
  setEditingTask: (id: string | null) => void
  loadTasksFromDb: () => Promise<void>

  // Session
  startSession: (taskId: string) => Promise<void>
  setLabel: (datapointId: string, questionId: string, value: LabelValue) => void
  setCurrentIndex: (index: number) => void
  setViewMode: (mode: ViewMode) => void

  // Settings
  setGoogleClientId: (id: string) => void
  setDriveFolderIds: (images: string, messages: string) => void
  setDefaultMessagesFolderId: (id: string) => void
  setDriveToken: (token: string | null) => void

  // Export
  exportSession: () => ExportedSession | null
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      authLoading: true,
      adminMode: !hasSupabase, // dev mode: always admin when Supabase not configured

      initAuth: () => {
        if (!hasSupabase) {
          set({ authLoading: false })
          return () => {}
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            set({ user: session.user })
            dbGetProfile()
              .then(p => { if (p) set({ profile: p, adminMode: p.isAdmin }) })
              .catch(console.error)
          }
          set({ authLoading: false })
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            set({ user: session.user })
            dbGetProfile()
              .then(p => { if (p) set({ profile: p, adminMode: p.isAdmin }) })
              .catch(console.error)
          } else {
            set({ user: null, profile: null, adminMode: false })
          }
        })

        return () => subscription.unsubscribe()
      },

      login: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },

      signup: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      },

      logout: async () => {
        await supabase.auth.signOut()
        set({ user: null, profile: null, adminMode: false })
      },

      page: 'home',
      tasks: [],
      editingTaskId: null,
      currentTaskId: null,
      datapoints: [],
      labels: {},
      currentIndex: 0,
      viewMode: 'detail',
      googleClientId: '',
      driveImagesFolderId: '',
      driveMessagesFolderId: '',
      defaultMessagesFolderId: '',
      driveToken: null,

      navigate: (page) => set({ page }),

      saveTask: (task) => {
        set((s) => {
          const exists = s.tasks.find((t) => t.id === task.id)
          return {
            tasks: exists
              ? s.tasks.map((t) => (t.id === task.id ? task : t))
              : [...s.tasks, task],
          }
        })
        dbUpsertTask(task).catch(console.error)
      },

      deleteTask: (id) => {
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
        dbDeleteTask(id).catch(console.error)
      },

      setEditingTask: (id) => set({ editingTaskId: id }),

      loadTasksFromDb: async () => {
        try {
          const tasks = await dbFetchTasks()
          if (tasks.length > 0) set({ tasks })
        } catch (e) {
          console.error('Failed to load tasks from DB:', e)
        }
      },

      startSession: async (taskId: string) => {
        try {
          const [dataset, prog] = await Promise.all([
            dbGetDataset(taskId),
            dbGetProgress(taskId),
          ])
          set({
            currentTaskId: taskId,
            datapoints: dataset?.datapoints ?? [],
            labels: prog?.labels ?? {},
            currentIndex: prog?.currentIndex ?? 0,
            page: 'labeling',
          })
        } catch (e) {
          console.error('Failed to start session:', e)
        }
      },

      setLabel: (datapointId, questionId, value) => {
        set((s) => ({
          labels: {
            ...s.labels,
            [datapointId]: { ...s.labels[datapointId], [questionId]: value },
          },
        }))
        if (saveProgressTimer) clearTimeout(saveProgressTimer)
        saveProgressTimer = setTimeout(() => {
          const { currentTaskId, labels, currentIndex } = get()
          if (currentTaskId) dbSaveProgress(currentTaskId, labels, currentIndex).catch(console.error)
        }, 1500)
      },

      setCurrentIndex: (index) => {
        set({ currentIndex: index })
        const { currentTaskId, labels } = get()
        if (currentTaskId) dbSaveProgress(currentTaskId, labels, index).catch(console.error)
      },

      setViewMode: (mode) => set({ viewMode: mode }),

      setGoogleClientId: (id) => set({ googleClientId: id }),
      setDriveFolderIds: (images, messages) =>
        set({ driveImagesFolderId: images, driveMessagesFolderId: messages }),
      setDefaultMessagesFolderId: (id) => set({ defaultMessagesFolderId: id }),
      setDriveToken: (token) => set({ driveToken: token }),

      exportSession: () => {
        const { currentTaskId, tasks, datapoints, labels, profile, user } = get()
        const task = tasks.find((t) => t.id === currentTaskId)
        if (!task) return null
        const labelerName = profile?.email ?? user?.email ?? ''
        return {
          task,
          labelerName,
          exportedAt: new Date().toISOString(),
          datapoints: datapoints.map((dp) => ({
            datapoint: dp,
            labels: labels[dp.id] ?? {},
          })),
        }
      },
    }),
    {
      name: 'labeling-app-storage',
      partialize: (s) => ({
        tasks: s.tasks,
        googleClientId: s.googleClientId,
        driveImagesFolderId: s.driveImagesFolderId,
        driveMessagesFolderId: s.driveMessagesFolderId,
        defaultMessagesFolderId: s.defaultMessagesFolderId,
      }),
    },
  ),
)
