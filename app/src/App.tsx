import { useEffect } from 'react'
import { useStore } from './store'
import { hasSupabase } from './lib/supabase'
import { AuthPage } from './pages/Auth'
import { HomePage } from './pages/Home'
import { TaskSetupPage } from './pages/TaskSetup'
import { LabelingPage } from './pages/Labeling'
import { ResultsPage } from './pages/Results'

export default function App() {
  const { page, user, authLoading, initAuth } = useStore()

  useEffect(() => {
    return initAuth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading && hasSupabase) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Loading…
        </div>
      </div>
    )
  }

  if (hasSupabase && !user) {
    return <AuthPage />
  }

  switch (page) {
    case 'home':       return <HomePage />
    case 'task-setup': return <TaskSetupPage />
    case 'labeling':   return <LabelingPage />
    case 'results':    return <ResultsPage />
    default:           return <HomePage />
  }
}
