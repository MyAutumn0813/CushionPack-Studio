import type { ApiMessage } from './api'

export type { ApiMessage } from './api'
export {
  API_BASE_URL,
  backendStartHint,
  normalizeInput,
  buildApiUrl,
  requestApi,
  parseApiResponse,
  downloadApiFile,
} from './api'

export type TaskHistoryItem = {
  fileName: string
  filePath: string
  taskName: string
  modifiedAt: string
  createdAt: string
  isMultiple: boolean
  projectName?: string
  pinned?: boolean
  archived?: boolean
}

export type TaskResultRow = {
  id: string
  predictedAcceleration: number
  predictedResult: string
}

export type TaskHistoryTasksResponse = ApiMessage & {
  tasks?: TaskHistoryItem[]
}

export type TaskHistoryDetail = {
  fileName: string
  taskName: string
  productType: string
  productName: string
  isMultiple: boolean
  projectName: string
  predictedResultsFileName: string
  canGenerateShap: boolean
  taskResults: TaskResultRow[]
}

export type TaskHistoryDetailResponse = ApiMessage & {
  fileName?: string
  taskName?: string
  productType?: string
  productName?: string
  isMultiple?: boolean
  projectName?: string
  predictedResultsFileName?: string
  canGenerateShap?: boolean
  taskResults?: Array<{
    id?: string
    predictedAcceleration?: number
    predictedResult?: string
  }>
}

export type ShapWaterfallStep = {
  feature: string
  featureValue: string
  contribution: number
  start: number
  end: number
  direction: 'positive' | 'negative'
}

export type WaterfallData = {
  targetId: string
  baseline: number
  prediction: number
  steps: ShapWaterfallStep[]
}

export type ShapWaterfallResponse = ApiMessage & {
  targetId?: string
  baseline?: number
  prediction?: number
  steps?: Array<{
    feature?: string
    featureValue?: string
    contribution?: number
    start?: number
    end?: number
    direction?: string
  }>
}

export const normalizeTaskResultRows = (
  rows: TaskHistoryDetailResponse['taskResults'],
): TaskResultRow[] =>
  Array.isArray(rows)
    ? rows
        .map((row) => ({
          id: String(row?.id ?? '').trim(),
          predictedAcceleration: Number(row?.predictedAcceleration),
          predictedResult: String(row?.predictedResult ?? '').trim(),
        }))
        .filter(
          (row) =>
            row.id.length > 0 &&
            Number.isFinite(row.predictedAcceleration) &&
            row.predictedResult.length > 0,
        )
    : []
