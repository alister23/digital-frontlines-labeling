import { supabase, hasSupabase } from './supabase'
import type { Task, Datapoint, Labels, Profile } from '../types'

// ── Tasks ──────────────────────────────────────────────────────────────────────

export async function dbFetchTasks(): Promise<Task[]> {
  if (!hasSupabase) return []
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id as string,
    name: r.name as string,
    questions: r.questions as Task['questions'],
    createdAt: r.created_at as string,
  }))
}

export async function dbUpsertTask(task: Task): Promise<void> {
  if (!hasSupabase) return
  const { error } = await supabase.from('tasks').upsert({
    id: task.id,
    name: task.name,
    questions: task.questions,
    created_at: task.createdAt,
  })
  if (error) throw error
}

export async function dbDeleteTask(id: string): Promise<void> {
  if (!hasSupabase) return
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── Datasets ───────────────────────────────────────────────────────────────────

export interface DatasetRecord {
  datapoints: Datapoint[]
  imagesFolderId: string
  messagesFolderId: string
  loadedBy: string
  loadedAt: string
}

export async function dbGetDataset(taskId: string): Promise<DatasetRecord | null> {
  if (!hasSupabase) return null
  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    datapoints: data.datapoints as Datapoint[],
    imagesFolderId: (data.images_folder_id as string) ?? '',
    messagesFolderId: (data.messages_folder_id as string) ?? '',
    loadedBy: (data.loaded_by as string) ?? '',
    loadedAt: data.loaded_at as string,
  }
}

export async function dbSaveDataset(
  taskId: string,
  datapoints: Datapoint[],
  imagesFolderId: string,
  messagesFolderId: string,
  loadedBy: string,
): Promise<void> {
  if (!hasSupabase) return
  const { error } = await supabase.from('datasets').upsert(
    {
      task_id: taskId,
      datapoints,
      images_folder_id: imagesFolderId,
      messages_folder_id: messagesFolderId,
      loaded_by: loadedBy,
      loaded_at: new Date().toISOString(),
    },
    { onConflict: 'task_id' },
  )
  if (error) throw error
}

// ── Profiles ───────────────────────────────────────────────────────────────────

export async function dbGetProfile(): Promise<Profile | null> {
  if (!hasSupabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    email: data.email as string,
    isAdmin: data.is_admin as boolean,
  }
}

// ── Progress ───────────────────────────────────────────────────────────────────

export interface ProgressRecord {
  labels: Labels
  currentIndex: number
}

export async function dbGetProgress(taskId: string): Promise<ProgressRecord | null> {
  if (!hasSupabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('progress')
    .select('labels, current_index')
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    labels: data.labels as Labels,
    currentIndex: data.current_index as number,
  }
}

export async function dbSaveProgress(
  taskId: string,
  labels: Labels,
  currentIndex: number,
): Promise<void> {
  if (!hasSupabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('progress').upsert(
    {
      user_id: user.id,
      task_id: taskId,
      labels,
      current_index: currentIndex,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,task_id' },
  )
  if (error) throw error
}

// ── Submissions ────────────────────────────────────────────────────────────────

export interface SubmissionRecord {
  id: string
  taskId: string
  labelerName: string
  labels: Labels
  submittedAt: string
}

export async function dbCreateSubmission(
  taskId: string,
  labelerName: string,
  labels: Labels,
): Promise<void> {
  if (!hasSupabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('submissions')
    .insert({ task_id: taskId, user_id: user?.id ?? null, labeler_name: labelerName, labels })
  if (error) throw error
}

export async function dbFetchSubmissions(): Promise<SubmissionRecord[]> {
  if (!hasSupabase) return []
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id as string,
    taskId: r.task_id as string,
    labelerName: r.labeler_name as string,
    labels: r.labels as Labels,
    submittedAt: r.submitted_at as string,
  }))
}
