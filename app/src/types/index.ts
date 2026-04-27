export type QuestionType = 'single' | 'multi' | 'text'
export type Page = 'home' | 'task-setup' | 'labeling' | 'results'
export type ViewMode = 'table' | 'detail'

export interface Question {
  id: string
  text: string
  type: QuestionType
  options?: string[]
  category: string
  required?: boolean
}

export interface QuestionCategory {
  id: string
  name: string
  questions: Question[]
}

export interface Task {
  id: string
  name: string
  questions: Question[]
  createdAt: string
}

export interface Datapoint {
  id: string
  imageName?: string
  imageUrl?: string
  caption?: string
  captionTranslated?: string
  [key: string]: unknown
}

export type LabelValue = string | string[]

export interface Labels {
  [datapointId: string]: {
    [questionId: string]: LabelValue
  }
}

export interface Profile {
  id: string
  email: string
  isAdmin: boolean
}

export interface ExportedSession {
  task: Task
  labelerName: string
  exportedAt: string
  datapoints: Array<{
    datapoint: Datapoint
    labels: { [questionId: string]: LabelValue }
  }>
}
