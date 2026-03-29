import { useEffect, useMemo, useRef, useState } from 'react'

import { backendStartHint, normalizeInput, parseApiResponse, requestApi } from '../features/api'
import DropdownSelect from '../features/components/DropdownSelect'

type CurvePoint = {
  actual: number
  predicted: number
}

type ModelMetrics = {
  r2: number
  rmse: number
}

type AlgorithmResult = {
  name: string
  accuracy: number
  train: ModelMetrics
  test: ModelMetrics
  trainCurve: CurvePoint[]
  testCurve: CurvePoint[]
}

type StoredModel = {
  version: string
  fileName: string
  allModelFileName?: string
  finalModelFileName?: string
  uploadedAt: string
  sourcePath: string
  isActive?: boolean
}

type ProductFolder = {
  id: string
  name: string
  sourcePath: string
  uploadedAt: string
  models: StoredModel[]
  algorithms: AlgorithmResult[]
  isVirtual?: boolean
}

type UploadResponse = {
  productType: string
  folderId: string
  folderName: string
  sourcePath: string
  uploadedAt: string
  modelVersion: string
  storedFileName: string
  allModelFileName?: string
  finalModelFileName?: string
  trainModelFileName?: string
  dataTrainFileName?: string
  dataTestFileName?: string
  validationFileName?: string
  bestHyperparameterFileName?: string
  message?: string
}

type DeleteModelResponse = {
  productType: string
  folderId: string
  folderName: string
  modelVersion: string
  deletedVersionName: string
  sourcePath: string
  message?: string
}

type DeleteProductTypeResponse = {
  productType: string
  sourcePath: string
  message?: string
}

type DeleteProductFolderResponse = {
  productType: string
  folderId: string
  folderName: string
  sourcePath: string
  message?: string
}

type ActivateModelResponse = {
  productType: string
  folderId: string
  folderName: string
  modelVersion: string
  fileName: string
  activatedAt: string
  sourcePath: string
  message?: string
}

type StoredModelPayload = {
  version: string
  fileName: string
  allModelFileName?: string
  finalModelFileName?: string
  uploadedAt: string
  sourcePath: string
  isActive?: boolean
}

type FolderPayload = {
  folderId: string
  folderName: string
  sourcePath: string
  uploadedAt: string
  files: string[]
  models?: StoredModelPayload[]
}

type ProductsResponse = {
  productType: string
  folders: FolderPayload[]
  message?: string
}

type ProductTypesResponse = {
  productTypes: string[]
  message?: string
}

type CrossValidationResultRow = {
  wflow_id: string
  rsq_mean: number
  rsq_sd: number
  rmse_mean: number
  rmse_sd: number
}

type CrossValidationResultsResponse = {
  datasetKey?: string
  rows: CrossValidationResultRow[]
  message?: string
}

type BestHyperparameterRow = {
  hyperparameter: string
  value: string
}

type BestHyperparametersResponse = {
  model?: string
  rows: BestHyperparameterRow[]
  message?: string
}

type AccuracyValueRow = {
  metric: string
  value: string
}

type AccuracyMetrics = {
  r2Train: number
  rmseTrain: number
  r2Test: number
  rmseTest: number
}

type AccuracyChartPoint = {
  set: string
  actual: number
  predicted: number
}

type AccuracyPerformanceResponse = {
  algorithm?: string
  metrics?: AccuracyMetrics
  points?: AccuracyChartPoint[]
  chartDataUrl?: string
  message?: string
}

type ToastState = {
  id: number
  message: string
}

const xAxis = [20, 30, 40, 50, 60, 70]

const buildCurve = (offsets: number[]): CurvePoint[] =>
  xAxis.map((actual, index) => ({
    actual,
    predicted: actual + offsets[index],
  }))

const createAlgorithm = (
  name: string,
  accuracy: number,
  train: ModelMetrics,
  test: ModelMetrics,
  trainOffsets: number[],
  testOffsets: number[],
): AlgorithmResult => ({
  name,
  accuracy,
  train,
  test,
  trainCurve: buildCurve(trainOffsets),
  testCurve: buildCurve(testOffsets),
})

const cloneAlgorithms = (algorithms: AlgorithmResult[]): AlgorithmResult[] =>
  algorithms.map((algorithm) => ({
    ...algorithm,
    train: { ...algorithm.train },
    test: { ...algorithm.test },
    trainCurve: algorithm.trainCurve.map((point) => ({ ...point })),
    testCurve: algorithm.testCurve.map((point) => ({ ...point })),
  }))

const uniqueSorted = (items: string[]) =>
  [...new Set(items.map((item) => item.trim()).filter((item) => item.length > 0))].sort((left, right) =>
    left.localeCompare(right),
  )

const unversionedModelLabel = 'Unversioned'
const previewAlgorithmNames = ['XGBoost', 'SVM', 'RF', 'KNN', 'MARS', 'LR'] as const
const deriveFallbackFinalModelFileName = (fileName: string) =>
  /_final model\.rds$/i.test(fileName.trim()) ? fileName : ''

const mapLegacyFilesToModels = (folder: FolderPayload): StoredModel[] =>
  folder.files.map((filePath) => {
    const [version, ...fileSegments] = filePath.split('/').filter((segment) => segment.length > 0)
    const hasVersionFolder = fileSegments.length > 0
    const fileName = hasVersionFolder ? fileSegments.join('/') : version
    const modelVersion = hasVersionFolder ? version : unversionedModelLabel
    const sourcePath = hasVersionFolder
      ? `${folder.sourcePath}/${encodeURIComponent(modelVersion)}/${encodeURIComponent(fileName)}`
      : `${folder.sourcePath}/${encodeURIComponent(fileName)}`

    return {
      version: modelVersion,
      fileName,
      allModelFileName: fileName,
      finalModelFileName: deriveFallbackFinalModelFileName(fileName),
      uploadedAt: folder.uploadedAt,
      sourcePath,
      isActive: false,
    }
  })

const mapStoredModel = (model: StoredModelPayload): StoredModel => ({
  version: model.version,
  fileName: model.fileName,
  allModelFileName: model.allModelFileName || model.fileName,
  finalModelFileName: model.finalModelFileName || deriveFallbackFinalModelFileName(model.fileName),
  uploadedAt: model.uploadedAt,
  sourcePath: model.sourcePath,
  isActive: Boolean(model.isActive),
})

const mapProductFolder = (folder: FolderPayload): ProductFolder => ({
  id: folder.folderId,
  name: folder.folderName,
  sourcePath: folder.sourcePath,
  uploadedAt: folder.uploadedAt,
  models: Array.isArray(folder.models) ? folder.models.map(mapStoredModel) : mapLegacyFilesToModels(folder),
  algorithms: cloneAlgorithms(algorithmTemplate),
})

const fetchProductFolders = async (productType: string) => {
  const normalizedType = normalizeInput(productType)
  if (!normalizedType) {
    return []
  }

  const response = await requestApi(
    `/api/library/products?productType=${encodeURIComponent(normalizedType)}`,
  )
  const payload = await parseApiResponse<ProductsResponse>(response)
  if (!response.ok) {
    throw new Error(payload.message ?? 'Failed to load product names.')
  }

  return payload.folders.map(mapProductFolder)
}

const algorithmTemplate: AlgorithmResult[] = [
  createAlgorithm(
    'XGBoost',
    0.956,
    { r2: 0.968, rmse: 2.21 },
    { r2: 0.918, rmse: 3.02 },
    [0.2, -0.2, 0.1, -0.2, 0.3, -0.2],
    [1.0, -1.2, 0.8, -1.3, 1.4, -1.0],
  ),
  createAlgorithm(
    'SVM',
    0.952,
    { r2: 0.961, rmse: 2.33 },
    { r2: 0.916, rmse: 3.08 },
    [0.2, -0.3, 0.2, -0.3, 0.4, -0.2],
    [1.1, -1.2, 0.9, -1.3, 1.5, -1.1],
  ),
  createAlgorithm(
    'RF',
    0.949,
    { r2: 0.956, rmse: 2.41 },
    { r2: 0.918, rmse: 3.05 },
    [0.3, -0.4, 0.1, -0.3, 0.5, -0.2],
    [1.2, -1.4, 0.8, -1.5, 1.6, -1.2],
  ),
  createAlgorithm(
    'KNN',
    0.913,
    { r2: 0.932, rmse: 2.88 },
    { r2: 0.882, rmse: 3.69 },
    [0.6, -0.7, 0.4, -0.6, 0.9, -0.5],
    [1.7, -1.9, 1.2, -2.0, 1.8, -1.5],
  ),
  createAlgorithm(
    'MARS',
    0.944,
    { r2: 0.953, rmse: 2.54 },
    { r2: 0.911, rmse: 3.16 },
    [0.3, -0.4, 0.2, -0.4, 0.5, -0.3],
    [1.3, -1.4, 1.0, -1.5, 1.6, -1.2],
  ),
  createAlgorithm(
    'LR',
    0.791,
    { r2: 0.884, rmse: 3.61 },
    { r2: 0.789, rmse: 4.93 },
    [1.1, -1.2, 0.8, -1.0, 1.2, -0.9],
    [2.1, -2.2, 1.6, -2.4, 2.0, -1.7],
  ),
]

const formatDateOnly = (value: string) => {
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : value
}
const formatMetricValue = (value: number, digits = 3) => value.toFixed(digits)
const formatBestHyperparameterValue = (value: string) => {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return '--'
  }

  const numericValue = Number(trimmedValue)
  if (!Number.isFinite(numericValue)) {
    return trimmedValue
  }

  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(4)
}

const getCrossValidationMetricValue = (row: CrossValidationResultRow, metricKey: 'rsq' | 'rmse') =>
  metricKey === 'rsq' ? row.rsq_mean : row.rmse_mean

const getCrossValidationMetricSpread = (row: CrossValidationResultRow, metricKey: 'rsq' | 'rmse') =>
  metricKey === 'rsq' ? row.rsq_sd : row.rmse_sd

const formatCrossValidationTick = (value: number, metricKey: 'rsq' | 'rmse') =>
  metricKey === 'rsq' ? value.toFixed(2) : value.toFixed(1)

const formatCrossValidationValue = (value: number) => value.toFixed(3)
const formatAccuracyChartTick = (value: number) =>
  Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')
const formatAccuracyChartValue = (value: number) => value.toFixed(2)
const isRdsModelFile = (fileName: string) => fileName.toLowerCase().endsWith('.rds')
const FINAL_MODEL_FILE_BASENAME = 'Final model'
const ALL_MODEL_FILE_BASENAME = 'All models'
const DATA_TRAIN_FILE_BASENAME = 'Data train'
const DATA_TEST_FILE_BASENAME = 'Data test'
const sanitizeUploadFileName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '_').trim()
const buildDeployedModelFileName = (productName: string, modelVersion: string) =>
  sanitizeUploadFileName(`${productName}_${modelVersion}_${FINAL_MODEL_FILE_BASENAME}.rds`)
const buildProjectedModelAttachmentFileName = (
  namePrefix: string,
  modelVersion: string,
  baseName: string,
) => sanitizeUploadFileName(`${namePrefix}_${modelVersion}_${baseName}.rds`)
const formatDeploymentModelLabel = (productName: string, modelVersion: string, fallbackLabel: string) => {
  const normalizedProductName = normalizeInput(productName)
  const normalizedModelVersion = normalizeInput(modelVersion)
  if (!normalizedProductName || !normalizedModelVersion) {
    return fallbackLabel
  }
  return `${normalizedProductName}_${normalizedModelVersion}`
}
const getUploadFileExtension = (fileName: string) => {
  const trimmedName = fileName.trim()
  const extension = trimmedName.includes('.') ? trimmedName.slice(trimmedName.lastIndexOf('.')) : ''
  return extension && extension !== '.' ? extension : ''
}
const buildProjectedAttachmentFileName = (
  namePrefix: string,
  modelVersion: string,
  baseName: string,
  originalFileName?: string,
) => {
  const extension = originalFileName ? getUploadFileExtension(originalFileName) : ''
  return sanitizeUploadFileName(`${namePrefix}_${modelVersion}_${baseName}${extension}`)
}

const preserveMainContentScrollPosition = () => {
  if (typeof document === 'undefined') {
    return
  }

  const scroller = document.querySelector<HTMLElement>('.main > section')
  if (!scroller) {
    return
  }

  const savedTop = scroller.scrollTop
  const savedLeft = scroller.scrollLeft
  const restoreScroll = () => {
    if (!scroller.isConnected) {
      return
    }

    if (Math.abs(scroller.scrollTop - savedTop) > 1 || Math.abs(scroller.scrollLeft - savedLeft) > 1) {
      scroller.scrollTo({ top: savedTop, left: savedLeft, behavior: 'auto' })
    }
  }

  window.requestAnimationFrame(restoreScroll)
  window.setTimeout(restoreScroll, 0)
}

type CrossValidationChartProps = {
  title: string
  metricKey: 'rsq' | 'rmse'
  rows: CrossValidationResultRow[]
}

type CrossValidationTooltipState = {
  x: number
  y: number
  width: number
  height: number
  line1: string
  line2: string
}

type AccuracyChartTooltipState = {
  x: number
  y: number
  width: number
  height: number
  line1: string
  line2: string
  line3: string
}

type AccuracyChartZoomState = {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

type UploadComboboxProps = {
  inputId: string
  inputValue: string
  onInputChange: (value: string) => void
  onOptionSelect: (value: string) => void
  options: string[]
  placeholder: string
  emptyMessage: string
  onOptionDelete?: (value: string) => void
  deletingOption?: string
  disableDelete?: boolean
}

type ModelListRow = StoredModel & {
  isPending?: boolean
}

const toModelIdentity = (model: Pick<StoredModel, 'version' | 'fileName'>) =>
  `${normalizeInput(model.version).toLowerCase()}::${normalizeInput(model.fileName).toLowerCase()}`

const mergeUploadedModelIntoFolders = (
  folders: ProductFolder[],
  folderName: string,
  model: StoredModel,
): ProductFolder[] => {
  let hasTargetFolder = false
  const mergedFolders = folders.map((folder) => {
    if (normalizeInput(folder.name).toLowerCase() !== normalizeInput(folderName).toLowerCase()) {
      return folder
    }

    hasTargetFolder = true
    const modelKey = toModelIdentity(model)
    const remainingModels = folder.models.filter((item) => toModelIdentity(item) !== modelKey)
    return {
      ...folder,
      uploadedAt: model.uploadedAt,
      models: [model, ...remainingModels],
    }
  })

  if (hasTargetFolder) {
    return mergedFolders
  }

  return [
    ...mergedFolders,
    {
      id: `__temp__${folderName.toLowerCase().replace(/\s+/g, '_')}`,
      name: folderName,
      sourcePath: '',
      uploadedAt: model.uploadedAt,
      models: [model],
      algorithms: cloneAlgorithms(algorithmTemplate),
    },
  ]
}

function DeleteBinIcon() {
  return (
    <>
      <svg viewBox="0 0 39 10" className="bin-top" aria-hidden="true" focusable="false">
        <path
          d="M2 9.5H37L34.2 3.2H24.6L22.4 0.5H16.6L14.4 3.2H4.8L2 9.5Z"
          fill="currentColor"
        />
      </svg>
      <svg viewBox="0 0 24 30" className="bin-bottom" aria-hidden="true" focusable="false">
        <path
          d="M5 4.5H19L17.6 26.1C17.5 27.5 16.4 28.5 15 28.5H9C7.6 28.5 6.5 27.5 6.4 26.1L5 4.5Z"
          fill="currentColor"
        />
        <path
          d="M9.2 9.2V22.2M12 9.2V22.2M14.8 9.2V22.2"
          stroke="rgba(255, 201, 201, 0.96)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </>
  )
}

function UploadCombobox({
  inputId,
  inputValue,
  onInputChange,
  onOptionSelect,
  options,
  placeholder,
  emptyMessage,
  onOptionDelete,
  deletingOption,
  disableDelete,
}: UploadComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const filteredOptions = useMemo(() => {
    const keyword = normalizeInput(inputValue).toLowerCase()
    if (!keyword) {
      return options
    }

    return options.filter((option) => option.toLowerCase().includes(keyword))
  }, [inputValue, options])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  const handleOptionClick = (value: string) => {
    onOptionSelect(value)
    setIsOpen(false)
  }

  return (
    <div className="library-combobox" ref={rootRef}>
      <div className="library-combobox__control">
        <input
          id={inputId}
          className="input library-combobox__input"
          value={inputValue}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            onInputChange(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIsOpen(true)
            }
            if (event.key === 'Escape') {
              setIsOpen(false)
            }
          }}
        />
        <button
          type="button"
          className="library-combobox__toggle"
          aria-label="Toggle options"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((current) => !current)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 4.5 6 8l4-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {isOpen ? (
        <div className="library-combobox__menu" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div key={option} className="library-combobox__option-row">
                <button
                  type="button"
                  className={`library-combobox__option${option === inputValue ? ' is-selected' : ''}`}
                  onClick={() => handleOptionClick(option)}
                >
                  {option}
                </button>
                {onOptionDelete ? (
                  <button
                    type="button"
                    className="library-combobox__option-delete bin-button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onOptionDelete(option)
                    }}
                    disabled={disableDelete || deletingOption === option}
                    aria-label={deletingOption === option ? `Deleting ${option}` : `Delete ${option}`}
                    title={deletingOption === option ? 'Deleting...' : 'Delete'}
                  >
                    <DeleteBinIcon />
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="library-combobox__empty">{emptyMessage}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function CrossValidationBarChart({ title, metricKey, rows }: CrossValidationChartProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltip, setTooltip] = useState<CrossValidationTooltipState | null>(null)
  const [hoveredModel, setHoveredModel] = useState<string | null>(null)

  useEffect(() => {
    setIsVisible(false)
    setTooltip(null)
    setHoveredModel(null)
    const frameId = window.requestAnimationFrame(() => setIsVisible(true))
    return () => window.cancelAnimationFrame(frameId)
  }, [rows, metricKey])

  const axisBounds = metricKey === 'rsq' ? { min: 0.5, max: 1.1, label: 'R²' } : { min: 0, max: 15, label: 'RMSE' }
  const chartRows = useMemo(() => rows.filter((row) => row.wflow_id.trim().length > 0), [rows])

  const maxValue = useMemo(() => {
    const observedMax = chartRows.reduce((currentMax, row) => {
      const rowValue = getCrossValidationMetricValue(row, metricKey) + getCrossValidationMetricSpread(row, metricKey)
      return Math.max(currentMax, rowValue)
    }, axisBounds.max)

    return Math.max(axisBounds.max, observedMax)
  }, [axisBounds.max, chartRows, metricKey])

  const ticks = useMemo(
    () => Array.from({ length: 5 }, (_, index) => axisBounds.min + ((maxValue - axisBounds.min) * index) / 4),
    [axisBounds.min, maxValue],
  )

  const width = 1000
  const height = 500
  const padding = { top: 24, right: 20, bottom: 74, left: 64 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const tooltipHeight = 80
  const tooltipGap = 14
  const slotCount = Math.max(chartRows.length, 1)
  const slotWidth = plotWidth / slotCount
  const barWidth = Math.min(82, Math.max(28, slotWidth * 0.6))
  const range = maxValue - axisBounds.min || 1
  const toY = (value: number) => {
    const clampedValue = Math.min(Math.max(value, axisBounds.min), maxValue)
    return padding.top + plotHeight - ((clampedValue - axisBounds.min) / range) * plotHeight
  }
  const barFill = metricKey === 'rsq' ? 'rgba(89, 132, 239, 0.88)' : 'rgba(224, 79, 79, 0.84)'
  const showTooltip = (row: CrossValidationResultRow, barX: number, barY: number, value: number) => {
    const tooltipLine1 = `Model: ${row.wflow_id}`
    const tooltipLine2 = `Value: ${formatCrossValidationValue(value)}`
    const tooltipWidth = Math.max(168, Math.min(228, Math.max(tooltipLine1.length, tooltipLine2.length) * 8.2 + 24))
    const tooltipX = Math.min(
      Math.max(barX + barWidth / 2 - tooltipWidth / 2, padding.left),
      width - padding.right - tooltipWidth,
    )
    const aboveY = barY - tooltipHeight - tooltipGap
    const belowY = barY + tooltipGap
    const tooltipY = aboveY >= padding.top ? aboveY : Math.min(belowY, height - padding.bottom - tooltipHeight - 8)

    setTooltip({
      x: tooltipX,
      y: tooltipY,
      width: tooltipWidth,
      height: tooltipHeight,
      line1: tooltipLine1,
      line2: tooltipLine2,
    })
  }

  return (
    <article className="library-cv-chart">
      <div className="library-cv-chart__header">
        <div>
          <h4 className="library-cv-chart__title">{title}</h4>
        </div>
        <div className="library-cv-chart__axis-note">{axisBounds.label}</div>
      </div>

      <svg className="library-cv-chart__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <text x={padding.left} y={18} className="library-cv-chart__axis-title">
          {axisBounds.label}
        </text>

        {ticks.map((tick, index) => {
          const y = toY(tick)
          const isBaseline = index === 0

          return (
            <g key={`${title}-tick-${tick}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                className={`library-cv-chart__grid-line${isBaseline ? ' library-cv-chart__grid-line--baseline' : ''}`}
              />
              <text x={padding.left - 10} y={y + 4} className="library-cv-chart__tick-label" textAnchor="end">
                {formatCrossValidationTick(tick, metricKey)}
              </text>
            </g>
          )
        })}

        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + plotHeight}
          className="library-cv-chart__axis-line"
        />
        <line
          x1={padding.left}
          y1={padding.top + plotHeight}
          x2={width - padding.right}
          y2={padding.top + plotHeight}
          className="library-cv-chart__axis-line"
        />

        {chartRows.map((row, index) => {
          const value = getCrossValidationMetricValue(row, metricKey)
          const spread = getCrossValidationMetricSpread(row, metricKey)
          const slotX = padding.left + index * slotWidth
          const barX = slotX + (slotWidth - barWidth) / 2
          const barY = toY(value)
          const barHeight = padding.top + plotHeight - barY
          const errorTop = toY(value + spread)
          const errorBottom = toY(Math.max(value - spread, axisBounds.min))
          const delay = index * 120
          const isHovered = hoveredModel === row.wflow_id

          return (
            <g
              key={`${row.wflow_id}-${index}`}
              className="library-cv-chart__bar-group"
              onMouseEnter={() => {
                setHoveredModel(row.wflow_id)
                showTooltip(row, barX, barY, value)
              }}
              onMouseLeave={() => {
                setHoveredModel(null)
                setTooltip(null)
              }}
            >
              <rect
                x={slotX}
                y={padding.top}
                width={slotWidth}
                height={plotHeight}
                className="library-cv-chart__hover-zone"
              />
              <g
                className={`library-cv-chart__bar-cluster${isHovered ? ' library-cv-chart__bar-cluster--active' : ''}`}
                style={{
                  opacity: isVisible ? 1 : 0,
                  transitionDelay: `${delay}ms`,
                }}
              >
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx="10"
                  fill={barFill}
                  className={`library-cv-chart__bar${isHovered ? ' library-cv-chart__bar--active' : ''}`}
                  style={{
                    transform: isVisible ? 'scaleY(1)' : 'scaleY(0)',
                    transitionDelay: `${delay}ms`,
                  }}
                />
                <line
                  x1={barX + barWidth / 2}
                  y1={errorTop}
                  x2={barX + barWidth / 2}
                  y2={errorBottom}
                  className={`library-cv-chart__error-line${isHovered ? ' library-cv-chart__error-line--active' : ''}`}
                  style={{
                    transitionDelay: `${delay + 90}ms`,
                  }}
                />
                <line
                  x1={barX + barWidth / 2 - 5}
                  y1={errorTop}
                  x2={barX + barWidth / 2 + 5}
                  y2={errorTop}
                  className={`library-cv-chart__error-line${isHovered ? ' library-cv-chart__error-line--active' : ''}`}
                  style={{
                    transitionDelay: `${delay + 90}ms`,
                  }}
                />
                <line
                  x1={barX + barWidth / 2 - 5}
                  y1={errorBottom}
                  x2={barX + barWidth / 2 + 5}
                  y2={errorBottom}
                  className={`library-cv-chart__error-line${isHovered ? ' library-cv-chart__error-line--active' : ''}`}
                  style={{
                    transitionDelay: `${delay + 90}ms`,
                  }}
                />
              </g>
              <text
                x={barX + barWidth / 2}
                y={height - 22}
                textAnchor="middle"
                className="library-cv-chart__group-label"
                style={{
                  opacity: isVisible ? 1 : 0,
                  transitionDelay: `${delay + 120}ms`,
                }}
              >
                {row.wflow_id}
              </text>
            </g>
          )
        })}

        {tooltip ? (
          <g
            className="library-cv-chart__tooltip"
            transform={`translate(${tooltip.x} ${tooltip.y})`}
            style={{
              opacity: tooltip ? 1 : 0,
            }}
          >
            <rect
              width={tooltip.width}
              height={tooltip.height}
              rx="12"
              className="library-cv-chart__tooltip-bg"
            />
            <text x={14} y={32} className="library-cv-chart__tooltip-title">
              {tooltip.line1}
            </text>
            <text x={14} y={60} className="library-cv-chart__tooltip-value">
              {tooltip.line2}
            </text>
          </g>
        ) : null}
      </svg>
    </article>
  )
}

function AccuracyPerformanceScatterChart({
  algorithm,
  points,
}: {
  algorithm: string
  points: AccuracyChartPoint[]
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltip, setTooltip] = useState<AccuracyChartTooltipState | null>(null)
  const [zoomState, setZoomState] = useState<AccuracyChartZoomState | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    setIsVisible(false)
    setTooltip(null)
    setZoomState(null)
    const frameId = window.requestAnimationFrame(() => setIsVisible(true))
    return () => window.cancelAnimationFrame(frameId)
  }, [algorithm, points])

  const sortedPoints = useMemo(
    () =>
      points
        .filter(
          (point) =>
            point.set.trim().length > 0 && Number.isFinite(point.actual) && Number.isFinite(point.predicted),
        )
        .map((point) => ({
          ...point,
          set: point.set.trim(),
        })),
    [points],
  )

  const trainingPoints = useMemo(
    () => sortedPoints.filter((point) => point.set.toLowerCase() === 'training'),
    [sortedPoints],
  )
  const testingPoints = useMemo(
    () => sortedPoints.filter((point) => point.set.toLowerCase() === 'testing'),
    [sortedPoints],
  )

  const width = 1000
  const height = 620
  const padding = { top: 24, right: 24, bottom: 86, left: 92 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const plotRight = width - padding.right
  const plotBottom = padding.top + plotHeight

  const baseAxisRange = useMemo(() => {
    const values = sortedPoints.flatMap((point) => [point.actual, point.predicted])
    if (values.length === 0) {
      return { min: 0, max: 1 }
    }

    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const span = maxValue - minValue || Math.max(Math.abs(maxValue), 1)
    const gap = span * 0.06
    return {
      min: minValue - gap,
      max: maxValue + gap,
    }
  }, [sortedPoints])

  const visibleRange = zoomState ?? {
    xMin: baseAxisRange.min,
    xMax: baseAxisRange.max,
    yMin: baseAxisRange.min,
    yMax: baseAxisRange.max,
  }
  const xTicks = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => visibleRange.xMin + ((visibleRange.xMax - visibleRange.xMin) * index) / 4),
    [visibleRange.xMax, visibleRange.xMin],
  )
  const yTicks = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => visibleRange.yMin + ((visibleRange.yMax - visibleRange.yMin) * index) / 4),
    [visibleRange.yMax, visibleRange.yMin],
  )

  const xRange = visibleRange.xMax - visibleRange.xMin || 1
  const yRange = visibleRange.yMax - visibleRange.yMin || 1
  const toX = (value: number) => padding.left + ((value - visibleRange.xMin) / xRange) * plotWidth
  const toY = (value: number) => padding.top + plotHeight - ((value - visibleRange.yMin) / yRange) * plotHeight
  const diagonalLine = useMemo(() => {
    const start = Math.max(visibleRange.xMin, visibleRange.yMin)
    const end = Math.min(visibleRange.xMax, visibleRange.yMax)
    if (start > end) {
      return null
    }

    return { start, end }
  }, [visibleRange.xMax, visibleRange.xMin, visibleRange.yMax, visibleRange.yMin])
  const clipPathId = `library-accuracy-chart-clip-${algorithm.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'default'}`

  const buildRegressionLine = (linePoints: AccuracyChartPoint[]) => {
    if (linePoints.length === 0) {
      return null
    }

    const minX = Math.min(...linePoints.map((point) => point.actual))
    const maxX = Math.max(...linePoints.map((point) => point.actual))
    if (linePoints.length === 1 || minX === maxX) {
      return {
        x1: minX,
        y1: linePoints[0].predicted,
        x2: maxX,
        y2: linePoints[0].predicted,
      }
    }

    const meanX = linePoints.reduce((sum, point) => sum + point.actual, 0) / linePoints.length
    const meanY = linePoints.reduce((sum, point) => sum + point.predicted, 0) / linePoints.length
    const covariance = linePoints.reduce(
      (sum, point) => sum + (point.actual - meanX) * (point.predicted - meanY),
      0,
    )
    const variance = linePoints.reduce((sum, point) => sum + (point.actual - meanX) ** 2, 0)
    const slope = variance === 0 ? 1 : covariance / variance
    const intercept = meanY - slope * meanX

    return {
      x1: minX,
      y1: intercept + slope * minX,
      x2: maxX,
      y2: intercept + slope * maxX,
    }
  }

  const trainingLine = useMemo(() => buildRegressionLine(trainingPoints), [trainingPoints])
  const testingLine = useMemo(() => buildRegressionLine(testingPoints), [testingPoints])

  const showTooltip = (point: AccuracyChartPoint, x: number, y: number) => {
    const tooltipWidth = 198
    const tooltipHeight = 88
    const tooltipGap = 14
    const tooltipX = Math.min(
      Math.max(x + tooltipGap, padding.left),
      width - padding.right - tooltipWidth,
    )
    const tooltipY = Math.max(padding.top, y - tooltipHeight - tooltipGap)

    setTooltip({
      x: tooltipX,
      y: tooltipY,
      width: tooltipWidth,
      height: tooltipHeight,
      line1: point.set,
      line2: `Actual: ${formatAccuracyChartValue(point.actual)}`,
      line3: `Predicted: ${formatAccuracyChartValue(point.predicted)}`,
    })
  }

  const renderTestingTriangle = (cx: number, cy: number, size: number) => {
    const half = size / 2
    return `${cx},${cy - half} ${cx - half},${cy + half} ${cx + half},${cy + half}`
  }

  const clampDomain = (min: number, max: number, nextMin: number, nextMax: number) => {
    const fullSpan = max - min || 1
    const nextSpan = nextMax - nextMin
    if (nextSpan >= fullSpan) {
      return { min, max }
    }

    let adjustedMin = nextMin
    let adjustedMax = nextMax
    if (adjustedMin < min) {
      adjustedMax += min - adjustedMin
      adjustedMin = min
    }
    if (adjustedMax > max) {
      adjustedMin -= adjustedMax - max
      adjustedMax = max
    }

    return {
      min: Math.max(min, adjustedMin),
      max: Math.min(max, adjustedMax),
    }
  }

  const handleWheelZoom = (clientX: number, clientY: number, deltaY: number) => {
    if (!svgRef.current || sortedPoints.length === 0) {
      return false
    }

    const bounds = svgRef.current.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) {
      return false
    }

    const svgX = ((clientX - bounds.left) / bounds.width) * width
    const svgY = ((clientY - bounds.top) / bounds.height) * height
    const isInsidePlot =
      svgX >= padding.left && svgX <= plotRight && svgY >= padding.top && svgY <= plotBottom

    if (!isInsidePlot) {
      return false
    }

    setTooltip(null)

    const baseSpan = baseAxisRange.max - baseAxisRange.min || 1
    const minSpan = Math.max(baseSpan * 0.08, baseSpan / 120)
    const zoomFactor = deltaY < 0 ? 0.88 : 1.14
    const nextXSpan = Math.min(baseSpan, Math.max(minSpan, xRange * zoomFactor))
    const nextYSpan = Math.min(baseSpan, Math.max(minSpan, yRange * zoomFactor))
    const xRatio = (svgX - padding.left) / plotWidth
    const yRatio = (plotBottom - svgY) / plotHeight
    const xAnchor = visibleRange.xMin + xRatio * xRange
    const yAnchor = visibleRange.yMin + yRatio * yRange
    const nextXDomain = clampDomain(
      baseAxisRange.min,
      baseAxisRange.max,
      xAnchor - xRatio * nextXSpan,
      xAnchor + (1 - xRatio) * nextXSpan,
    )
    const nextYDomain = clampDomain(
      baseAxisRange.min,
      baseAxisRange.max,
      yAnchor - yRatio * nextYSpan,
      yAnchor + (1 - yRatio) * nextYSpan,
    )
    const isResetRange =
      Math.abs(nextXDomain.min - baseAxisRange.min) < baseSpan * 0.002 &&
      Math.abs(nextXDomain.max - baseAxisRange.max) < baseSpan * 0.002 &&
      Math.abs(nextYDomain.min - baseAxisRange.min) < baseSpan * 0.002 &&
      Math.abs(nextYDomain.max - baseAxisRange.max) < baseSpan * 0.002

    if (isResetRange) {
      setZoomState(null)
      return true
    }

    setZoomState({
      xMin: nextXDomain.min,
      xMax: nextXDomain.max,
      yMin: nextYDomain.min,
      yMax: nextYDomain.max,
    })
    return true
  }

  useEffect(() => {
    const svgElement = svgRef.current
    if (!svgElement) {
      return
    }

    const handleNativeWheel = (event: WheelEvent) => {
      const didZoom = handleWheelZoom(event.clientX, event.clientY, event.deltaY)
      if (didZoom) {
        event.preventDefault()
      }
    }

    svgElement.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => svgElement.removeEventListener('wheel', handleNativeWheel)
  }, [baseAxisRange.max, baseAxisRange.min, handleWheelZoom, plotBottom, plotRight, sortedPoints.length, xRange, yRange, visibleRange.xMax, visibleRange.xMin, visibleRange.yMax, visibleRange.yMin])

  return (
    <article className="library-accuracy-chart">
      <div className="library-accuracy-chart__header">
        <div className="library-accuracy-chart__badge">{algorithm}</div>
        <div className="library-accuracy-chart__legend" aria-hidden="true">
          <span className="library-accuracy-chart__legend-item">
            <span className="library-accuracy-chart__legend-marker library-accuracy-chart__legend-marker--training" />
            Training data
          </span>
          <span className="library-accuracy-chart__legend-item">
            <span className="library-accuracy-chart__legend-marker library-accuracy-chart__legend-marker--testing" />
            Testing data
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="library-accuracy-chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${algorithm} accuracy performance chart`}
        onDoubleClick={() => {
          setTooltip(null)
          setZoomState(null)
        }}
      >
        <defs>
          <clipPath id={clipPathId}>
            <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        {yTicks.map((tick, index) => {
          const y = toY(tick)
          return (
            <g key={`accuracy-y-tick-${tick}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={plotRight}
                y2={y}
                className={`library-accuracy-chart__grid-line${index === 0 ? ' is-baseline' : ''}`}
              />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="library-accuracy-chart__tick-label">
                {formatAccuracyChartTick(tick)}
              </text>
            </g>
          )
        })}

        {xTicks.map((tick) => {
          const x = toX(tick)
          return (
            <g key={`accuracy-x-tick-${tick}`}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={plotBottom}
                className="library-accuracy-chart__grid-line is-vertical"
              />
              <text x={x} y={plotBottom + 28} textAnchor="middle" className="library-accuracy-chart__tick-label">
                {formatAccuracyChartTick(tick)}
              </text>
            </g>
          )
        })}

        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={plotBottom} className="library-accuracy-chart__axis-line" />
        <line x1={padding.left} y1={plotBottom} x2={plotRight} y2={plotBottom} className="library-accuracy-chart__axis-line" />

        <g clipPath={`url(#${clipPathId})`}>
          {diagonalLine ? (
            <line
              x1={toX(diagonalLine.start)}
              y1={toY(diagonalLine.start)}
              x2={toX(diagonalLine.end)}
              y2={toY(diagonalLine.end)}
              className="library-accuracy-chart__diagonal"
              style={{
                opacity: isVisible ? 1 : 0,
              }}
            />
          ) : null}

          {trainingLine ? (
            <line
              x1={toX(trainingLine.x1)}
              y1={toY(trainingLine.y1)}
              x2={toX(trainingLine.x2)}
              y2={toY(trainingLine.y2)}
              className="library-accuracy-chart__fit-line library-accuracy-chart__fit-line--training"
              style={{
                opacity: isVisible ? 1 : 0,
              }}
            />
          ) : null}
          {testingLine ? (
            <line
              x1={toX(testingLine.x1)}
              y1={toY(testingLine.y1)}
              x2={toX(testingLine.x2)}
              y2={toY(testingLine.y2)}
              className="library-accuracy-chart__fit-line library-accuracy-chart__fit-line--testing"
              style={{
                opacity: isVisible ? 1 : 0,
              }}
            />
          ) : null}

          {sortedPoints.map((point, index) => {
            const x = toX(point.actual)
            const y = toY(point.predicted)
            const isTraining = point.set.toLowerCase() === 'training'
            const delay = Math.min(index * 8, 420)
            return isTraining ? (
              <circle
                key={`${point.set}-${index}`}
                cx={x}
                cy={y}
                r={5}
                className="library-accuracy-chart__point library-accuracy-chart__point--training"
                onMouseEnter={() => showTooltip(point, x, y)}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  opacity: isVisible ? 1 : 0,
                  transitionDelay: `${delay}ms`,
                }}
              />
            ) : (
              <polygon
                key={`${point.set}-${index}`}
                points={renderTestingTriangle(x, y, 11)}
                className="library-accuracy-chart__point library-accuracy-chart__point--testing"
                onMouseEnter={() => showTooltip(point, x, y)}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  opacity: isVisible ? 1 : 0,
                  transitionDelay: `${delay}ms`,
                }}
              />
            )
          })}
        </g>

        <text x={width / 2} y={height - 16} textAnchor="middle" className="library-accuracy-chart__axis-label">
          Simulated peak acceleration (g)
        </text>
        <text
          x={26}
          y={height / 2}
          textAnchor="middle"
          className="library-accuracy-chart__axis-label"
          transform={`rotate(-90 26 ${height / 2})`}
        >
          Predicted peak acceleration (g)
        </text>

        {tooltip ? (
          <g
            className="library-accuracy-chart__tooltip"
            transform={`translate(${tooltip.x} ${tooltip.y})`}
          >
            <rect
              width={tooltip.width}
              height={tooltip.height}
              rx="14"
              className="library-accuracy-chart__tooltip-bg"
            />
            <text x={16} y={28} className="library-accuracy-chart__tooltip-title">
              {tooltip.line1}
            </text>
            <text x={16} y={50} className="library-accuracy-chart__tooltip-value">
              {tooltip.line2}
            </text>
            <text x={16} y={72} className="library-accuracy-chart__tooltip-value">
              {tooltip.line3}
            </text>
          </g>
        ) : null}
      </svg>
    </article>
  )
}

export default function LibraryPage() {
  const [productTypes, setProductTypes] = useState<string[]>([])
  const [selectedProductType, setSelectedProductType] = useState('')
  const [productFolders, setProductFolders] = useState<ProductFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('')
  const [selectedAccuracyAlgorithm, setSelectedAccuracyAlgorithm] = useState('')
  const [uploadFeedback, setUploadFeedback] = useState('')
  const [toastState, setToastState] = useState<ToastState | null>(null)
  const [crossValidationResults, setCrossValidationResults] = useState<CrossValidationResultRow[] | null>(null)
  const [crossValidationError, setCrossValidationError] = useState('')
  const [isLoadingCrossValidation, setIsLoadingCrossValidation] = useState(false)
  const [bestHyperparameterRows, setBestHyperparameterRows] = useState<BestHyperparameterRow[] | null>(null)
  const [bestHyperparameterError, setBestHyperparameterError] = useState('')
  const [isLoadingBestHyperparameters, setIsLoadingBestHyperparameters] = useState(false)
  const [accuracyMetrics, setAccuracyMetrics] = useState<AccuracyMetrics | null>(null)
  const [accuracyChartPoints, setAccuracyChartPoints] = useState<AccuracyChartPoint[]>([])
  const [accuracyChartDataUrl, setAccuracyChartDataUrl] = useState('')
  const [accuracyPerformanceError, setAccuracyPerformanceError] = useState('')
  const [isLoadingAccuracyPerformance, setIsLoadingAccuracyPerformance] = useState(false)
  const [isLoadingTypes, setIsLoadingTypes] = useState(false)
  const [isLoadingFolders, setIsLoadingFolders] = useState(false)

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadProductTypeInput, setUploadProductTypeInput] = useState('')
  const [uploadProductNameInput, setUploadProductNameInput] = useState('')
  const [uploadModelVersionInput, setUploadModelVersionInput] = useState('')
  const [uploadTrainModelFile, setUploadTrainModelFile] = useState<File | null>(null)
  const [uploadFinalModelFile, setUploadFinalModelFile] = useState<File | null>(null)
  const [uploadDataTrainFile, setUploadDataTrainFile] = useState<File | null>(null)
  const [uploadDataTestFile, setUploadDataTestFile] = useState<File | null>(null)
  const [uploadValidationFile, setUploadValidationFile] = useState<File | null>(null)
  const [uploadBestHyperparameterFile, setUploadBestHyperparameterFile] = useState<File | null>(null)
  const [uploadFolders, setUploadFolders] = useState<ProductFolder[]>([])
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isDeletingUploadType, setIsDeletingUploadType] = useState('')
  const [isDeletingUploadName, setIsDeletingUploadName] = useState('')
  const [isActivatingModelKey, setIsActivatingModelKey] = useState('')
  const [isDeletingModelKey, setIsDeletingModelKey] = useState('')
  const [uploadFileInputKey, setUploadFileInputKey] = useState(0)
  const uploadTrainModelFileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadFinalModelFileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadDataTrainFileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadDataTestFileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadValidationFileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadBestHyperparameterFileInputRef = useRef<HTMLInputElement | null>(null)

  const fallbackFolder = useMemo<ProductFolder>(
    () => ({
      id: '__virtual__',
      name: 'No product name yet',
      sourcePath: selectedProductType
        ? `/database/${encodeURIComponent(selectedProductType)}`
        : '/database',
      uploadedAt: '--',
      models: [],
      algorithms: cloneAlgorithms(algorithmTemplate),
      isVirtual: true,
    }),
    [selectedProductType],
  )

  const selectedFolder =
    productFolders.find((item) => item.id === selectedFolderId) ?? productFolders[0] ?? fallbackFolder

  const normalizedUploadProductType = normalizeInput(uploadProductTypeInput)
  const normalizedUploadProductName = normalizeInput(uploadProductNameInput)
  const normalizedUploadModelVersion = normalizeInput(uploadModelVersionInput)
  const projectedUploadTrainModelFileName =
    normalizedUploadProductName && normalizedUploadModelVersion
      ? buildProjectedModelAttachmentFileName(
          normalizedUploadProductName,
          normalizedUploadModelVersion,
          ALL_MODEL_FILE_BASENAME,
        )
      : buildProjectedModelAttachmentFileName('Product name', 'Version', ALL_MODEL_FILE_BASENAME)
  const projectedUploadFinalModelFileName =
    normalizedUploadProductName && normalizedUploadModelVersion
      ? buildDeployedModelFileName(normalizedUploadProductName, normalizedUploadModelVersion)
      : buildDeployedModelFileName('Product name', 'Version')
  const projectedUploadDataTrainFileName =
    normalizedUploadProductName && normalizedUploadModelVersion
      ? buildProjectedAttachmentFileName(
          normalizedUploadProductName,
          normalizedUploadModelVersion,
          DATA_TRAIN_FILE_BASENAME,
          uploadDataTrainFile?.name,
        )
      : buildProjectedAttachmentFileName('Product name', 'Version', DATA_TRAIN_FILE_BASENAME)
  const projectedUploadDataTestFileName =
    normalizedUploadProductName && normalizedUploadModelVersion
      ? buildProjectedAttachmentFileName(
          normalizedUploadProductName,
          normalizedUploadModelVersion,
          DATA_TEST_FILE_BASENAME,
          uploadDataTestFile?.name,
        )
      : buildProjectedAttachmentFileName('Product name', 'Version', DATA_TEST_FILE_BASENAME)
  const uploadNameOptions = useMemo(
    () => uniqueSorted(uploadFolders.map((folder) => folder.name)),
    [uploadFolders],
  )
  const selectedUploadFolder = useMemo(() => {
    const normalizedName = normalizedUploadProductName.toLowerCase()
    if (!normalizedName) {
      return null
    }

    return (
      uploadFolders.find((folder) => normalizeInput(folder.name).toLowerCase() === normalizedName) ?? null
    )
  }, [normalizedUploadProductName, uploadFolders])
  const uploadModels = useMemo(
    () => (selectedUploadFolder?.models ?? []).filter((model) => isRdsModelFile(model.fileName)),
    [selectedUploadFolder],
  )
  const pendingUploadRow = useMemo<ModelListRow | null>(() => {
    if (!uploadTrainModelFile || !normalizedUploadModelVersion || !normalizedUploadProductName) {
      return null
    }

    return {
      version: normalizedUploadModelVersion,
      fileName: projectedUploadTrainModelFileName,
      allModelFileName: projectedUploadTrainModelFileName,
      finalModelFileName: uploadFinalModelFile ? projectedUploadFinalModelFileName : '',
      uploadedAt: 'Pending deployment',
      sourcePath: '',
      isPending: true,
    }
  }, [
    uploadTrainModelFile,
    uploadFinalModelFile,
    normalizedUploadModelVersion,
    normalizedUploadProductName,
    projectedUploadTrainModelFileName,
    projectedUploadFinalModelFileName,
  ])
  const modelListRows = useMemo<ModelListRow[]>(() => {
    if (!pendingUploadRow) {
      return uploadModels
    }

    return [pendingUploadRow, ...uploadModels]
  }, [pendingUploadRow, uploadModels])
  const previewAlgorithms = useMemo(() => {
    const algorithmsByName = new Map(selectedFolder.algorithms.map((algorithm) => [algorithm.name, algorithm]))
    return previewAlgorithmNames
      .map((name) => algorithmsByName.get(name))
      .filter((algorithm): algorithm is AlgorithmResult => Boolean(algorithm))
  }, [selectedFolder.algorithms])
  const availablePreviewAlgorithms = previewAlgorithms.length > 0 ? previewAlgorithms : algorithmTemplate
  const selectedFolderRdsModels = useMemo(
    () => selectedFolder.models.filter((model) => isRdsModelFile(model.fileName)),
    [selectedFolder],
  )
  const activeStoredModel = useMemo(
    () => selectedFolderRdsModels.find((model) => model.isActive) ?? null,
    [selectedFolderRdsModels],
  )
  const displayStoredModel = activeStoredModel
  const backendModelStatus = useMemo(() => {
    return activeStoredModel ? 'Ready' : 'Not ready'
  }, [activeStoredModel])
  const accuracyValueRows = useMemo<AccuracyValueRow[]>(() => {
    if (!accuracyMetrics) {
      return []
    }

    return [
      { metric: 'Train R²', value: formatMetricValue(accuracyMetrics.r2Train, 4) },
      { metric: 'Train RMSE', value: formatMetricValue(accuracyMetrics.rmseTrain, 2) },
      { metric: 'Test R²', value: formatMetricValue(accuracyMetrics.r2Test, 4) },
      { metric: 'Test RMSE', value: formatMetricValue(accuracyMetrics.rmseTest, 2) },
    ]
  }, [accuracyMetrics])

  useEffect(() => {
    setCrossValidationResults(null)
    setCrossValidationError('')
    setBestHyperparameterRows(null)
    setBestHyperparameterError('')
    setAccuracyMetrics(null)
    setAccuracyChartPoints([])
    setAccuracyChartDataUrl('')
    setAccuracyPerformanceError('')
    setIsLoadingAccuracyPerformance(false)
  }, [selectedFolder.id, displayStoredModel?.version, displayStoredModel?.fileName])

  useEffect(() => {
    if (!toastState) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setToastState(null)
    }, 2800)

    return () => window.clearTimeout(timeoutId)
  }, [toastState])

  const showToast = (message: string) => {
    setToastState({ id: Date.now(), message })
  }

  useEffect(() => {
    if (!selectedAlgorithm) {
      setBestHyperparameterRows(null)
      setBestHyperparameterError('')
      setIsLoadingBestHyperparameters(false)
      return
    }

    if (!selectedProductType || selectedFolder.isVirtual || !displayStoredModel) {
      setBestHyperparameterRows(null)
      setBestHyperparameterError('Activate a deployed version to load best hyper-parameters.')
      setIsLoadingBestHyperparameters(false)
      return
    }

    let cancelled = false

    const loadBestHyperparameters = async () => {
      setIsLoadingBestHyperparameters(true)
      setBestHyperparameterError('')

      try {
        const query = new URLSearchParams({
          productType: selectedProductType,
          productName: selectedFolder.name,
          modelVersion: displayStoredModel.version,
          fileName: displayStoredModel.fileName,
          algorithm: selectedAlgorithm,
        })

        const response = await requestApi(`/api/library/best-hyperparameters?${query.toString()}`)
        const payload = await parseApiResponse<BestHyperparametersResponse>(response)
        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to load best hyper-parameters.')
        }

        if (cancelled) {
          return
        }

        setBestHyperparameterRows(Array.isArray(payload.rows) ? payload.rows : [])
        if (payload.message) {
          showToast(payload.message)
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        setBestHyperparameterRows(null)
        setBestHyperparameterError(
          error instanceof Error ? error.message : 'Failed to load best hyper-parameters.',
        )
      } finally {
        if (!cancelled) {
          setIsLoadingBestHyperparameters(false)
        }
      }
    }

    void loadBestHyperparameters()

    return () => {
      cancelled = true
    }
  }, [
    selectedAlgorithm,
    selectedProductType,
    selectedFolder.isVirtual,
    selectedFolder.name,
    displayStoredModel?.version,
    displayStoredModel?.fileName,
  ])

  const handleViewCrossValidation = async () => {
    if (!selectedProductType || selectedFolder.isVirtual || !displayStoredModel) {
      setCrossValidationError('Please activate a deployed version first.')
      return
    }

    setIsLoadingCrossValidation(true)
    setCrossValidationError('')
    try {
      const query = new URLSearchParams({
        productType: selectedProductType,
        productName: selectedFolder.name,
        modelVersion: displayStoredModel.version,
        fileName: displayStoredModel.fileName,
      })

      const response = await requestApi(`/api/library/cross-validation-results?${query.toString()}`)
      const payload = await parseApiResponse<CrossValidationResultsResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load cross-validation results.')
      }

      if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
        throw new Error('Cross-validation results are empty.')
      }

      setCrossValidationResults(payload.rows)
      if (payload.message) {
        showToast(payload.message)
      }
    } catch (error) {
      setCrossValidationResults(null)
      setCrossValidationError(error instanceof Error ? error.message : 'Failed to load cross-validation results.')
    } finally {
      setIsLoadingCrossValidation(false)
    }
  }

  const syncProductFolders = async (productType: string, preferredFolderId?: string) => {
    const normalizedType = normalizeInput(productType)
    if (!normalizedType) {
      setProductFolders([])
      setSelectedFolderId('')
      return []
    }

    setIsLoadingFolders(true)
    try {
      const mappedFolders = await fetchProductFolders(normalizedType)

      setProductFolders(mappedFolders)
      setSelectedFolderId((current) => {
        if (preferredFolderId && mappedFolders.some((folder) => folder.id === preferredFolderId)) {
          return preferredFolderId
        }
        if (mappedFolders.some((folder) => folder.id === current)) {
          return current
        }
        return mappedFolders[0]?.id ?? ''
      })
      return mappedFolders
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load product names.'
      setUploadFeedback(message)
      setProductFolders([])
      setSelectedFolderId('')
      return []
    } finally {
      setIsLoadingFolders(false)
    }
  }

  const syncProductTypes = async (preferredType?: string): Promise<{ productTypes: string[]; selectedType: string }> => {
    setIsLoadingTypes(true)
    try {
      const response = await requestApi('/api/library/product-types')
      const payload = await parseApiResponse<ProductTypesResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load product types.')
      }

      const nextProductTypes = uniqueSorted(payload.productTypes)
      setProductTypes(nextProductTypes)

      const nextSelectedType =
        (preferredType && nextProductTypes.includes(preferredType) && preferredType) ||
        (selectedProductType && nextProductTypes.includes(selectedProductType) && selectedProductType) ||
        nextProductTypes[0] ||
        ''

      setSelectedProductType(nextSelectedType)
      if (nextSelectedType) {
        await syncProductFolders(nextSelectedType)
      } else {
        setProductFolders([])
        setSelectedFolderId('')
      }
      return { productTypes: nextProductTypes, selectedType: nextSelectedType }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load product types.'
      setUploadFeedback(message)
      return { productTypes: [], selectedType: '' }
    } finally {
      setIsLoadingTypes(false)
    }
  }

  useEffect(() => {
    void syncProductTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedAlgorithm) {
      return
    }
    if (availablePreviewAlgorithms.some((algorithm) => algorithm.name === selectedAlgorithm)) {
      return
    }
    setSelectedAlgorithm('')
  }, [availablePreviewAlgorithms, selectedAlgorithm])

  useEffect(() => {
    if (!selectedAccuracyAlgorithm) {
      setAccuracyMetrics(null)
      setAccuracyChartPoints([])
      setAccuracyChartDataUrl('')
      setAccuracyPerformanceError('')
      setIsLoadingAccuracyPerformance(false)
      return
    }

    if (!availablePreviewAlgorithms.some((algorithm) => algorithm.name === selectedAccuracyAlgorithm)) {
      setAccuracyMetrics(null)
      setAccuracyChartPoints([])
      setAccuracyChartDataUrl('')
      setAccuracyPerformanceError('')
      setIsLoadingAccuracyPerformance(false)
      return
    }

    if (!selectedProductType || selectedFolder.isVirtual || !displayStoredModel) {
      setAccuracyMetrics(null)
      setAccuracyChartPoints([])
      setAccuracyChartDataUrl('')
      setAccuracyPerformanceError('Activate a deployed version to load accuracy performance.')
      setIsLoadingAccuracyPerformance(false)
      return
    }

    let cancelled = false

    const loadAccuracyPerformance = async () => {
      setIsLoadingAccuracyPerformance(true)
      setAccuracyMetrics(null)
      setAccuracyChartPoints([])
      setAccuracyChartDataUrl('')
      setAccuracyPerformanceError('')

      try {
        const query = new URLSearchParams({
          productType: selectedProductType,
          productName: selectedFolder.name,
          modelVersion: displayStoredModel.version,
          fileName: displayStoredModel.fileName,
          algorithm: selectedAccuracyAlgorithm,
        })

        const response = await requestApi(`/api/library/accuracy-performance?${query.toString()}`)
        const payload = await parseApiResponse<AccuracyPerformanceResponse>(response)
        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to load accuracy performance.')
        }

        if (cancelled) {
          return
        }

        setAccuracyMetrics(payload.metrics ?? null)
        setAccuracyChartPoints(Array.isArray(payload.points) ? payload.points : [])
        setAccuracyChartDataUrl(typeof payload.chartDataUrl === 'string' ? payload.chartDataUrl : '')
        if (payload.message) {
          showToast(payload.message)
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        setAccuracyMetrics(null)
        setAccuracyChartPoints([])
        setAccuracyChartDataUrl('')
        setAccuracyPerformanceError(
          error instanceof Error ? error.message : 'Failed to load accuracy performance.',
        )
      } finally {
        if (!cancelled) {
          setIsLoadingAccuracyPerformance(false)
        }
      }
    }

    void loadAccuracyPerformance()

    return () => {
      cancelled = true
    }
  }, [
    availablePreviewAlgorithms,
    selectedAccuracyAlgorithm,
    selectedProductType,
    selectedFolder.isVirtual,
    selectedFolder.name,
    displayStoredModel?.version,
    displayStoredModel?.fileName,
  ])

  useEffect(() => {
    if (!selectedAccuracyAlgorithm) {
      return
    }
    if (availablePreviewAlgorithms.some((algorithm) => algorithm.name === selectedAccuracyAlgorithm)) {
      return
    }
    setSelectedAccuracyAlgorithm('')
  }, [availablePreviewAlgorithms, selectedAccuracyAlgorithm])

  useEffect(() => {
    if (!isUploadModalOpen) {
      return
    }

    if (!normalizedUploadProductType) {
      setUploadFolders([])
      return
    }

    let cancelled = false
    const loadNames = async () => {
      try {
        if (cancelled) {
          return
        }
        const nextUploadFolders = await fetchProductFolders(normalizedUploadProductType)
        if (cancelled) {
          return
        }
        setUploadFolders(nextUploadFolders)
      } catch {
        if (!cancelled) {
          setUploadFolders([])
        }
      }
    }

    void loadNames()
    return () => {
      cancelled = true
    }
  }, [isUploadModalOpen, normalizedUploadProductType])

  useEffect(() => {
    if (!isUploadModalOpen) {
      return
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUploading) {
        setIsUploadModalOpen(false)
      }
    }

    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isUploadModalOpen, isUploading])

  const handleMainTypeChange = async (nextType: string) => {
    setSelectedProductType(nextType)
    await syncProductFolders(nextType)
  }

  const openUploadModal = () => {
    const initialType = selectedProductType || productTypes[0] || ''
    const initialName = selectedFolder.isVirtual ? '' : selectedFolder.name
    const initialUploadFolders = initialType && initialType === selectedProductType ? productFolders : []

    setUploadProductTypeInput(initialType)
    setUploadProductNameInput(initialName)
    setUploadModelVersionInput('')
    setUploadTrainModelFile(null)
    setUploadFinalModelFile(null)
    setUploadDataTrainFile(null)
    setUploadDataTestFile(null)
    setUploadValidationFile(null)
    setUploadBestHyperparameterFile(null)
    setUploadFolders(initialUploadFolders)
    setUploadError('')
    setIsDeletingUploadType('')
    setIsDeletingUploadName('')
    setUploadFileInputKey((current) => current + 1)
    setIsUploadModalOpen(true)
  }

  const closeUploadModal = () => {
    if (isUploading) {
      return
    }
    setIsUploadModalOpen(false)
    setUploadError('')
    setIsDeletingUploadType('')
    setIsDeletingUploadName('')
  }

  const toModelKey = (model: Pick<StoredModel, 'version' | 'fileName' | 'uploadedAt'>) =>
    `${model.version}::${model.fileName}::${model.uploadedAt}`

  const handleUploadTypeInput = (value: string) => {
    const nextType = normalizeInput(value)
    const hasTypeChanged = nextType.toLowerCase() !== normalizedUploadProductType.toLowerCase()

    setUploadProductTypeInput(value)
    if (hasTypeChanged) {
      setUploadProductNameInput('')
    }
    if (normalizeInput(value) === selectedProductType) {
      setUploadFolders(productFolders)
      return
    }
    setUploadFolders([])
  }

  const handleDeleteUploadType = async (typeName: string) => {
    const normalizedTypeName = normalizeInput(typeName)
    if (!normalizedTypeName) {
      return
    }

    const shouldDelete = window.confirm(
      `Delete product type "${normalizedTypeName}" and all product names under it? This cannot be undone.`,
    )
    if (!shouldDelete) {
      return
    }

    setIsDeletingUploadType(normalizedTypeName)
    setUploadError('')
    try {
      const response = await requestApi('/api/library/product-types', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productType: normalizedTypeName,
        }),
      })
      const payload = await parseApiResponse<DeleteProductTypeResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to delete product type.')
      }

      const deletedTypeLower = normalizedTypeName.toLowerCase()
      const wasSelectedUploadType = normalizedUploadProductType.toLowerCase() === deletedTypeLower
      const { selectedType: nextType } = await syncProductTypes()

      if (wasSelectedUploadType) {
        setUploadProductTypeInput(nextType)
        setUploadProductNameInput('')
        setUploadFolders([])
      }

      setUploadFeedback('')
      showToast(`Deleted product type ${payload.productType}`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to delete product type.')
    } finally {
      setIsDeletingUploadType('')
    }
  }

  const handleDeleteUploadName = async (productName: string) => {
    const normalizedType = normalizeInput(uploadProductTypeInput)
    const normalizedName = normalizeInput(productName)
    if (!normalizedType) {
      setUploadError('Please select product type first.')
      return
    }
    if (!normalizedName) {
      return
    }

    const shouldDelete = window.confirm(`Delete product name "${normalizedName}" under "${normalizedType}"?`)
    if (!shouldDelete) {
      return
    }

    setIsDeletingUploadName(normalizedName)
    setUploadError('')
    try {
      const response = await requestApi('/api/library/products', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productType: normalizedType,
          productName: normalizedName,
        }),
      })
      const payload = await parseApiResponse<DeleteProductFolderResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to delete product name.')
      }

      const refreshedFolders =
        normalizedType === selectedProductType
          ? await syncProductFolders(normalizedType, selectedFolderId || undefined)
          : await fetchProductFolders(normalizedType)

      setUploadFolders(refreshedFolders)
      const wasSelectedUploadName = normalizedUploadProductName.toLowerCase() === normalizedName.toLowerCase()
      if (wasSelectedUploadName) {
        setUploadProductNameInput(refreshedFolders[0]?.name ?? '')
      }

      setUploadFeedback('')
      showToast(`Deleted product ${payload.folderName}`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to delete product name.')
    } finally {
      setIsDeletingUploadName('')
    }
  }

  const handleActivateModel = async (model: StoredModel) => {
    const normalizedType = normalizeInput(uploadProductTypeInput)
    const normalizedName = normalizeInput(uploadProductNameInput)
    if (!normalizedType || !normalizedName) {
      setUploadError('Please select product type and product name before activating.')
      return
    }

    const modelKey = toModelKey(model)
    setIsActivatingModelKey(modelKey)
    setUploadError('')
    try {
      const activateBody = JSON.stringify({
        productType: normalizedType,
        productName: normalizedName,
        modelVersion: model.version,
        fileName: model.fileName,
      })

      const requestActivate = async (path: string) => {
        const response = await requestApi(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: activateBody,
        })
        const payload = await parseApiResponse<ActivateModelResponse>(response)
        return { response, payload }
      }

      let { response, payload } = await requestActivate('/api/library/models/activate')
      if (response.status === 404) {
        ;({ response, payload } = await requestActivate('/api/library/model/activate'))
      }
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Activate API route not found. ${backendStartHint}`)
        }
        throw new Error(payload.message ?? 'Failed to activate model version.')
      }

      const refreshedFolders = await fetchProductFolders(normalizedType)
      setUploadFolders(refreshedFolders)
      if (normalizedType === selectedProductType) {
        await syncProductFolders(normalizedType, selectedFolderId || undefined)
      }
      setUploadFeedback('')
      showToast(`Activated version ${payload.modelVersion} for ${payload.folderName}`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to activate model version.')
    } finally {
      setIsActivatingModelKey('')
    }
  }

  const handleDeleteModel = async (model: StoredModel) => {
    const normalizedType = normalizeInput(uploadProductTypeInput)
    const normalizedName = normalizeInput(uploadProductNameInput)
    if (!normalizedType || !normalizedName) {
      setUploadError('Please select product type and product name before deleting.')
      return
    }

    const modelKey = toModelKey(model)
    setIsDeletingModelKey(modelKey)
    setUploadError('')
    try {
      const deleteBody = JSON.stringify({
        productType: normalizedType,
        productName: normalizedName,
        modelVersion: model.version,
      })

      const requestDelete = async (path: string, method: 'POST' | 'DELETE') => {
        const response = await requestApi(path, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: deleteBody,
        })
        const payload = await parseApiResponse<DeleteModelResponse>(response)
        return { response, payload }
      }

      let { response, payload } = await requestDelete('/api/library/models/delete', 'POST')
      if (response.status === 404) {
        ;({ response, payload } = await requestDelete('/api/library/models', 'DELETE'))
      }
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to delete model.')
      }

      const refreshedFolders = await fetchProductFolders(normalizedType)
      setUploadFolders(refreshedFolders)
      if (normalizedType === selectedProductType) {
        await syncProductFolders(normalizedType, selectedFolderId || undefined)
      }
      setUploadFeedback(`Deleted version ${payload.deletedVersionName} from ${payload.folderName}`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to delete model version.')
    } finally {
      setIsDeletingModelKey('')
    }
  }

  const handleUploadSubmit = async () => {
    const normalizedType = normalizeInput(uploadProductTypeInput)
    const normalizedName = normalizeInput(uploadProductNameInput)

    if (!normalizedType) {
      setUploadError('Please enter product type.')
      return
    }
    if (!normalizedName) {
      setUploadError('Please enter product name.')
      return
    }
    if (!normalizedUploadModelVersion) {
      setUploadError('Please enter version number.')
      return
    }
    if (!uploadTrainModelFile) {
      setUploadError('Please select an all model file.')
      return
    }
    if (!uploadFinalModelFile) {
      setUploadError('Please select a final model file.')
      return
    }
    if (!uploadDataTrainFile) {
      setUploadError('Please select a data train file.')
      return
    }
    if (!uploadDataTestFile) {
      setUploadError('Please select a data test file.')
      return
    }

    setIsUploading(true)
    setUploadError('')
    try {
      const formData = new FormData()
      formData.append('productType', normalizedType)
      formData.append('productName', normalizedName)
      formData.append('modelVersion', normalizedUploadModelVersion)
      formData.append('modelFile', uploadTrainModelFile, projectedUploadTrainModelFileName)
      formData.append('finalModelFile', uploadFinalModelFile, projectedUploadFinalModelFileName)
      if (uploadDataTrainFile) {
        formData.append('dataTrainFile', uploadDataTrainFile)
      }
      if (uploadDataTestFile) {
        formData.append('dataTestFile', uploadDataTestFile)
      }
      if (uploadValidationFile) {
        formData.append('validationFile', uploadValidationFile)
      }
      if (uploadBestHyperparameterFile) {
        formData.append('bestHyperparameterFile', uploadBestHyperparameterFile)
      }

      const response = await requestApi('/api/library/upload-model', {
        method: 'POST',
        body: formData,
      })
      const payload = await parseApiResponse<UploadResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to upload model.')
      }

      const deployedVersion = normalizeInput(payload.modelVersion || normalizedUploadModelVersion || unversionedModelLabel)
      const uploadedAllModelFileName =
        payload.allModelFileName || payload.trainModelFileName || payload.storedFileName
      const uploadedFinalModelFileName =
        payload.finalModelFileName ||
        (payload.storedFileName !== uploadedAllModelFileName ? payload.storedFileName : '')
      const uploadedModel: StoredModel = {
        version: deployedVersion,
        fileName: uploadedAllModelFileName,
        allModelFileName: uploadedAllModelFileName,
        finalModelFileName: uploadedFinalModelFileName,
        uploadedAt: payload.uploadedAt || new Date().toISOString().slice(0, 16).replace('T', ' '),
        sourcePath: payload.sourcePath
          ? `${payload.sourcePath}/${encodeURIComponent(uploadedAllModelFileName)}`
          : '',
      }

      setProductTypes((current) => uniqueSorted([...current, payload.productType]))
      setSelectedProductType(payload.productType)
      const refreshedFolders = await syncProductFolders(payload.productType, payload.folderId)
      const mergedFolders = mergeUploadedModelIntoFolders(refreshedFolders, payload.folderName, uploadedModel)
      setProductFolders(mergedFolders)
      setUploadFolders(mergedFolders)
      setUploadProductTypeInput(payload.productType)
      setUploadProductNameInput(payload.folderName)
      setUploadTrainModelFile(null)
      setUploadFinalModelFile(null)
      setUploadDataTrainFile(null)
      setUploadDataTestFile(null)
      setUploadValidationFile(null)
      setUploadBestHyperparameterFile(null)
      setUploadFileInputKey((current) => current + 1)
      setUploadFeedback('')
      const attachmentNotes = [
        uploadedFinalModelFileName,
        payload.dataTrainFileName,
        payload.dataTestFileName,
        payload.validationFileName,
        payload.bestHyperparameterFileName,
      ].filter(Boolean)
      const attachmentSummary = attachmentNotes.length > 0 ? ` and ${attachmentNotes.join(' and ')}` : ''
      showToast(`Uploaded ${uploadedAllModelFileName}${attachmentSummary} to ${payload.folderName}/${deployedVersion}`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to upload model.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="page library-page">
      <section className="page-section">
        <div className="section-header library-header">
          <div className="library-header__copy">
            <h2>Library</h2>
            {isLoadingTypes ? <div className="status-note">Loading product types from backend...</div> : null}
            {isLoadingFolders ? <div className="status-note">Loading product names from backend...</div> : null}
            {uploadFeedback ? <div className="status-note library-upload-feedback">{uploadFeedback}</div> : null}
          </div>
          <button type="button" className="btn btn--primary library-upload-trigger" onClick={openUploadModal}>
            Deploy model
          </button>
        </div>

        <div className="library-layout">
          <div className="library-layout__top">
            <section className="card library-layout__card library-layout__card--a library-panel-section library-panel-section--compact">
              <h3 className="card-title">Product model</h3>
              <div className="library-product-stack">
                <div className="library-product-stack__selectors">
                  <div className="form-row">
                    <label htmlFor="library-product-type">Product type</label>
                    <DropdownSelect
                      id="library-product-type"
                      className="select"
                      value={selectedProductType}
                      onChange={(event) => void handleMainTypeChange(event.target.value)}
                      disabled={productTypes.length === 0}
                    >
                      {productTypes.length === 0 ? (
                        <option value="">No product available</option>
                      ) : (
                        productTypes.map((productType) => (
                          <option key={productType} value={productType}>
                            {productType}
                          </option>
                        ))
                      )}
                    </DropdownSelect>
                  </div>

                  <div className="form-row">
                    <label htmlFor="library-folder">Product name</label>
                    <DropdownSelect
                      id="library-folder"
                      className="select"
                      value={selectedFolder.id}
                      onChange={(event) => setSelectedFolderId(event.target.value)}
                      disabled={productFolders.length === 0}
                    >
                      {productFolders.length === 0 ? (
                        <option value={fallbackFolder.id}>No product name available</option>
                      ) : (
                        productFolders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))
                      )}
                    </DropdownSelect>
                  </div>
                </div>

                <div className="library-status-card">
                  <div className="library-status-card__header">
                    <div className="form-row">
                      <label>Model status</label>
                    </div>
                    <span className={`library-status-badge${backendModelStatus === 'Ready' ? ' is-ready' : ' is-not-ready'}`}>
                      {backendModelStatus}
                    </span>
                  </div>

                  {displayStoredModel ? (
                    <dl className="library-status-grid">
                      <div className="library-status-grid__item">
                        <dt>Model version</dt>
                        <dd>{displayStoredModel?.version ?? '--'}</dd>
                      </div>
                      <div className="library-status-grid__item">
                        <dt>Updated at</dt>
                        <dd>{displayStoredModel?.uploadedAt ? formatDateOnly(displayStoredModel.uploadedAt) : '--'}</dd>
                      </div>
                      <div className="library-status-grid__item library-status-grid__item--full">
                        <dt>All model file</dt>
                        <dd>{displayStoredModel?.allModelFileName ?? displayStoredModel?.fileName ?? '--'}</dd>
                      </div>
                      <div className="library-status-grid__item library-status-grid__item--full">
                        <dt>Final model file</dt>
                        <dd>{displayStoredModel?.finalModelFileName ?? '--'}</dd>
                      </div>
                    </dl>
                  ) : selectedFolderRdsModels.length > 0 ? (
                    <div className="empty-state library-status-card__empty">
                      No active model found for this product. Please try to activate available model.
                    </div>
                  ) : (
                    <div className="empty-state library-status-card__empty">No deployed backend model found for this product.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="card library-layout__card library-layout__card--b">
              <div className="library-summary-grid library-summary-grid--preview">
                <section className="library-panel-section library-preview-panel library-preview-panel--main">
                  <div className="library-preview-header">
                    <h3 className="card-title">Model preview</h3>
                  </div>

                  <div className="form-row library-preview-control">
                    <label htmlFor="library-preview-model">Model selection</label>
                    <DropdownSelect
                      id="library-preview-model"
                      className="select"
                      value={selectedAlgorithm}
                      onOpen={() => preserveMainContentScrollPosition()}
                      onChange={(event) => {
                        preserveMainContentScrollPosition()
                        setSelectedAlgorithm(event.target.value)
                      }}
                    >
                      <option value="">Please select a model</option>
                      {availablePreviewAlgorithms.map((algorithm) => (
                        <option key={algorithm.name} value={algorithm.name}>
                          {algorithm.name}
                        </option>
                      ))}
                    </DropdownSelect>
                  </div>

                  <div className="library-status-card library-preview-card">
                    <div className="library-status-card__header">
                      <div className="form-row">
                        <label htmlFor="library-preview-model">Best hyper-parameter</label>
                      </div>
                      <span
                        className={`library-status-badge${selectedAlgorithm && !isLoadingBestHyperparameters ? ' is-ready' : ''}`}
                      >
                        {isLoadingBestHyperparameters ? 'Loading' : selectedAlgorithm || 'Pending'}
                      </span>
                    </div>

                    {bestHyperparameterError ? (
                      <div className="status-note library-cross-validation__error">{bestHyperparameterError}</div>
                    ) : null}

                    <div className="table-scroll library-preview-table-scroll">
                      <table className="table library-placeholder-table">
                        <thead>
                          <tr>
                            <th>Parameter</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isLoadingBestHyperparameters ? (
                            <tr>
                              <td>Loading best hyper-parameters...</td>
                              <td>--</td>
                            </tr>
                          ) : bestHyperparameterRows && bestHyperparameterRows.length > 0 ? (
                            bestHyperparameterRows.map((row) => (
                              <tr key={`${row.hyperparameter}-${row.value}`}>
                                <td>{row.hyperparameter}</td>
                                <td>{formatBestHyperparameterValue(row.value)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td>
                                {bestHyperparameterError
                                  ? 'Unable to load best hyper-parameters.'
                                  : selectedAlgorithm
                                    ? 'No hyper-parameters found for this model.'
                                    : 'Please select a model.'}
                              </td>
                              <td>--</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>

          <section className="card library-layout__card library-layout__card--c library-panel-section">
            <div className="library-panel-header">
              <h3 className="card-title">Model performance</h3>
              <button
                type="button"
                className="btn library-upload-trigger library-panel-header__button"
                onClick={() => void handleViewCrossValidation()}
                disabled={isLoadingCrossValidation || selectedFolder.isVirtual || !displayStoredModel}
              >
                {isLoadingCrossValidation ? 'Loading...' : 'View'}
              </button>
            </div>

            {crossValidationError ? (
              <div className="status-note library-cross-validation__error">{crossValidationError}</div>
            ) : null}

            <div className="library-cv-grid library-cv-grid--split">
              <div className="library-cv-slot">
                {isLoadingCrossValidation ? (
                  <div className="plot-placeholder library-visual-placeholder library-cv-slot__placeholder">
                    <span className="library-visual-placeholder__label">Loading cross-validation R²...</span>
                  </div>
                ) : crossValidationResults ? (
                  <CrossValidationBarChart title="(a) 10-fold cross-validation R²" metricKey="rsq" rows={crossValidationResults} />
                ) : (
                  <div className="plot-placeholder library-visual-placeholder library-cv-slot__placeholder">
                    <span className="library-visual-placeholder__label">
                      Cross-validation R² chart.
                    </span>
                  </div>
                )}
              </div>

              <div className="library-cv-slot">
                {isLoadingCrossValidation ? (
                  <div className="plot-placeholder library-visual-placeholder library-cv-slot__placeholder">
                    <span className="library-visual-placeholder__label">Loading cross-validation RMSE...</span>
                  </div>
                ) : crossValidationResults ? (
                  <CrossValidationBarChart title="(b) 10-fold cross-validation RMSE" metricKey="rmse" rows={crossValidationResults} />
                ) : (
                  <div className="plot-placeholder library-visual-placeholder library-cv-slot__placeholder">
                    <span className="library-visual-placeholder__label">
                      Cross-validation RMSE chart.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="card library-layout__card library-layout__card--d library-panel-section">
            <h3 className="card-title">Accuracy performance</h3>

            <div className="library-accuracy-grid">
              <section className="library-panel-section library-preview-panel">
                <div className="form-row library-preview-control">
                  <label htmlFor="library-accuracy-model">Model selection</label>
                  <DropdownSelect
                    id="library-accuracy-model"
                    className="select"
                    value={selectedAccuracyAlgorithm}
                    onOpen={() => preserveMainContentScrollPosition()}
                    onChange={(event) => {
                      preserveMainContentScrollPosition()
                      setSelectedAccuracyAlgorithm(event.target.value)
                    }}
                  >
                    <option value="">Please select a model</option>
                    {availablePreviewAlgorithms.map((algorithm) => (
                      <option key={algorithm.name} value={algorithm.name}>
                        {algorithm.name}
                      </option>
                    ))}
                  </DropdownSelect>
                </div>

                <div className="library-status-card library-preview-card">
                  <div className="library-status-card__header">
                    <div className="form-row">
                      <label htmlFor="library-accuracy-model">Accuracy value</label>
                    </div>
                    <span className={`library-status-badge${selectedAccuracyAlgorithm ? ' is-ready' : ''}`}>
                      {selectedAccuracyAlgorithm || 'Pending'}
                    </span>
                  </div>

                  <div className="table-scroll library-preview-table-scroll">
                    <table className="table library-placeholder-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoadingAccuracyPerformance ? (
                          <tr>
                            <td>Loading accuracy metrics...</td>
                            <td>--</td>
                          </tr>
                        ) : accuracyValueRows.length > 0 ? (
                          accuracyValueRows.map((row) => (
                            <tr key={row.metric}>
                              <td>{row.metric}</td>
                              <td>{row.value}</td>
                            </tr>
                          ))
                        ) : accuracyPerformanceError ? (
                          <tr>
                            <td>{accuracyPerformanceError}</td>
                            <td>--</td>
                          </tr>
                        ) : (
                          <tr>
                            <td>Please select a model.</td>
                            <td>--</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="library-panel-section">
                {isLoadingAccuracyPerformance ? (
                  <div className="plot-placeholder library-visual-placeholder library-accuracy-slot">
                    <span className="library-visual-placeholder__label">Loading accuracy performance chart...</span>
                  </div>
                ) : accuracyChartPoints.length > 0 ? (
                  <div className="library-accuracy-slot library-accuracy-slot--filled">
                    <AccuracyPerformanceScatterChart
                      algorithm={selectedAccuracyAlgorithm}
                      points={accuracyChartPoints}
                    />
                  </div>
                ) : accuracyChartDataUrl ? (
                  <div className="library-accuracy-slot library-accuracy-slot--filled">
                    <img
                      className="library-accuracy-slot__image"
                      src={accuracyChartDataUrl}
                      alt={`${selectedAccuracyAlgorithm} accuracy performance chart`}
                    />
                  </div>
                ) : (
                  <div className="plot-placeholder library-visual-placeholder library-accuracy-slot">
                    <span className="library-visual-placeholder__label">
                      {accuracyPerformanceError || 'Accuracy performance chart.'}
                    </span>
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      </section>
      {toastState ? (
        <div className="library-toast" role="status" aria-live="polite">
          {toastState.message}
        </div>
      ) : null}

      {isUploadModalOpen ? (
        <div className="library-modal-backdrop" onClick={closeUploadModal}>
          <div
            className="library-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-upload-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="library-modal__header">
              <h4 id="library-upload-title" className="card-title">
                Deploy model
              </h4>
              <button
                type="button"
                className="library-modal__close"
                aria-label="Close deployment dialog"
                onClick={closeUploadModal}
              >
                X
              </button>
            </div>

            <div className="library-modal__body">
              <div className="library-modal__row">
                <div className="form-row">
                  <label htmlFor="upload-product-type">Product type</label>
                  <UploadCombobox
                    inputId="upload-product-type"
                    inputValue={uploadProductTypeInput}
                    onInputChange={handleUploadTypeInput}
                    onOptionSelect={handleUploadTypeInput}
                    options={productTypes}
                    placeholder="Enter or select product type"
                    emptyMessage="No existing product type."
                    onOptionDelete={handleDeleteUploadType}
                    deletingOption={isDeletingUploadType}
                    disableDelete={isUploading || isDeletingUploadType.length > 0 || isDeletingUploadName.length > 0}
                  />
                </div>

                <div className="form-row">
                  <label htmlFor="upload-product-name">Product name</label>
                  <UploadCombobox
                    inputId="upload-product-name"
                    inputValue={uploadProductNameInput}
                    onInputChange={setUploadProductNameInput}
                    onOptionSelect={setUploadProductNameInput}
                    options={uploadNameOptions}
                    placeholder="Enter or select product name"
                    emptyMessage={
                      normalizedUploadProductType ? 'No existing product name for this type.' : 'Enter product type first.'
                    }
                    onOptionDelete={handleDeleteUploadName}
                    deletingOption={isDeletingUploadName}
                    disableDelete={
                      !normalizedUploadProductType ||
                      isUploading ||
                      isDeletingUploadType.length > 0 ||
                      isDeletingUploadName.length > 0
                    }
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="library-model-list__heading">
                  <label>Model list</label>
                  {selectedUploadFolder ? (
                    <span className="status-note">Current product: {selectedUploadFolder.name}</span>
                  ) : null}
                </div>
                {modelListRows.length > 0 ? (
                  <div className="table-scroll library-model-list">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Version</th>
                          <th>Model</th>
                          <th>Active</th>
                          <th>Uploaded at</th>
                          <th>Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modelListRows.map((model) => (
                          <tr
                            key={toModelKey(model)}
                            className={model.isPending ? 'library-model-list__row--pending' : undefined}
                          >
                            <td>{model.version}</td>
                            <td>
                              {formatDeploymentModelLabel(
                                selectedUploadFolder?.name ?? normalizedUploadProductName,
                                model.version,
                                model.fileName,
                              )}
                            </td>
                            <td>
                              {model.isPending ? (
                                <span className="library-model-list__active-placeholder">Pending</span>
                              ) : model.isActive ? (
                                <span className="library-model-list__active-badge">Active</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn library-action-btn library-action-btn--green library-model-list__activate"
                                  onClick={() => void handleActivateModel(model)}
                                  disabled={
                                    isUploading ||
                                    isDeletingModelKey === toModelKey(model) ||
                                    isActivatingModelKey === toModelKey(model)
                                  }
                                >
                                  {isActivatingModelKey === toModelKey(model) ? 'Activating...' : 'Activate'}
                                </button>
                              )}
                            </td>
                            <td>{formatDateOnly(model.uploadedAt)}</td>
                            <td className="library-model-list__delete-cell">
                              {model.isPending ? (
                                <span className="library-model-list__pending-tag">Queued</span>
                              ) : (
                                <button
                                  type="button"
                                  className="library-model-list__delete bin-button"
                                  onClick={() => void handleDeleteModel(model)}
                                  disabled={
                                    isUploading ||
                                    isDeletingModelKey === toModelKey(model) ||
                                    isActivatingModelKey === toModelKey(model)
                                  }
                                  aria-label={
                                    isDeletingModelKey === toModelKey(model)
                                      ? 'Deleting version'
                                      : 'Delete version'
                                  }
                                  title={isDeletingModelKey === toModelKey(model) ? 'Deleting version...' : 'Delete version'}
                                >
                                  <DeleteBinIcon />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state library-model-list__empty">
                    {normalizedUploadProductName
                      ? 'No .rds models found for this product. Deployment will create the version folder.'
                      : 'Select a product name to inspect its existing models.'}
                  </div>
                )}
              </div>
              
                <div className="form-row">
                  <label htmlFor="upload-model-version">Model version</label>
                  <input
                    id="upload-model-version"
                    className="input"
                    value={uploadModelVersionInput}
                    placeholder="e.g. V1.0"
                    onChange={(event) => setUploadModelVersionInput(event.target.value)}
                  />
                </div>

              <div className="library-model-list__heading">
                  <label>Model upload</label>
                </div>
              <div className="library-deploy-panel">
                <div className="library-upload-grid">
                <div className="form-row">
                  <label htmlFor="upload-all-model-file">All model file</label>
                  <div className="library-file-picker">
                    <input
                      key={uploadFileInputKey}
                      ref={uploadTrainModelFileInputRef}
                      id="upload-all-model-file"
                      className="library-file-picker__input"
                      type="file"
                      accept=".rds"
                      onChange={(event) => setUploadTrainModelFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="library-file-picker__trigger"
                      onClick={() => uploadTrainModelFileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        <path
                          d="M17 15V18M17 21V18M17 18H14M17 18H20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>Choose file</span>
                    </button>
                    <span className="library-file-picker__name">
                      {uploadTrainModelFile ? uploadTrainModelFile.name : '(Required)'}
                    </span>
                  </div>
                  <span className="status-note">
                    Stored as {projectedUploadTrainModelFileName}.
                  </span>
                </div>

                <div className="form-row">
                  <label htmlFor="upload-final-model-file">Final model file</label>
                  <div className="library-file-picker">
                    <input
                      key={`${uploadFileInputKey}-final-model`}
                      ref={uploadFinalModelFileInputRef}
                      id="upload-final-model-file"
                      className="library-file-picker__input"
                      type="file"
                      accept=".rds"
                      onChange={(event) => setUploadFinalModelFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="library-file-picker__trigger"
                      onClick={() => uploadFinalModelFileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        <path
                          d="M17 15V18M17 21V18M17 18H14M17 18H20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>Choose file</span>
                    </button>
                    <span className="library-file-picker__name">
                      {uploadFinalModelFile ? uploadFinalModelFile.name : '(Required)'}
                    </span>
                  </div>
                  <span className="status-note">
                    Stored as {projectedUploadFinalModelFileName}.
                  </span>
                </div>

                <div className="form-row">
                  <label htmlFor="upload-data-train-file">Data train file</label>
                  <div className="library-file-picker">
                    <input
                      key={`${uploadFileInputKey}-data-train`}
                      ref={uploadDataTrainFileInputRef}
                      id="upload-data-train-file"
                      className="library-file-picker__input"
                      type="file"
                      accept=".csv,.tsv,.xlsx,.xls"
                      onChange={(event) => setUploadDataTrainFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="library-file-picker__trigger"
                      onClick={() => uploadDataTrainFileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        <path
                          d="M17 15V18M17 21V18M17 18H14M17 18H20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>Choose file</span>
                    </button>
                    <span className="library-file-picker__name">
                      {uploadDataTrainFile ? uploadDataTrainFile.name : '(Required)'}
                    </span>
                  </div>
                  <span className="status-note">
                    Stored as{' '}
                    {uploadDataTrainFile
                      ? projectedUploadDataTrainFileName
                      : 'Product name_Version_Data train'}.
                  </span>
                </div>

                <div className="form-row">
                  <label htmlFor="upload-data-test-file">Data test file</label>
                  <div className="library-file-picker">
                    <input
                      key={`${uploadFileInputKey}-data-test`}
                      ref={uploadDataTestFileInputRef}
                      id="upload-data-test-file"
                      className="library-file-picker__input"
                      type="file"
                      accept=".csv,.tsv,.xlsx,.xls"
                      onChange={(event) => setUploadDataTestFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="library-file-picker__trigger"
                      onClick={() => uploadDataTestFileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        <path
                          d="M17 15V18M17 21V18M17 18H14M17 18H20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>Choose file</span>
                    </button>
                    <span className="library-file-picker__name">
                      {uploadDataTestFile ? uploadDataTestFile.name : '(Required)'}
                    </span>
                  </div>
                  <span className="status-note">
                    Stored as{' '}
                    {uploadDataTestFile
                      ? projectedUploadDataTestFileName
                      : 'Product name_Version_Data test'}.
                  </span>
                </div>

                <div className="form-row">
                  <label htmlFor="upload-validation-file">Validation_accuracy file</label>
                  <div className="library-file-picker">
                    <input
                      key={`${uploadFileInputKey}-validation`}
                      ref={uploadValidationFileInputRef}
                      id="upload-validation-file"
                      className="library-file-picker__input"
                      type="file"
                      accept=".xlsx"
                      onChange={(event) => setUploadValidationFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="library-file-picker__trigger"
                      onClick={() => uploadValidationFileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        <path
                          d="M17 15V18M17 21V18M17 18H14M17 18H20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>Choose file</span>
                    </button>
                    <span className="library-file-picker__name">
                      {uploadValidationFile ? uploadValidationFile.name : '(Optional)'}
                    </span>
                  </div>
                  <span className="status-note">Stored as Validation_accuracy.xlsx.</span>
                </div>

                <div className="form-row">
                  <label htmlFor="upload-best-hyperparameter-file">Best_hyperparamter file</label>
                  <div className="library-file-picker">
                    <input
                      key={`${uploadFileInputKey}-best-hyperparameter`}
                      ref={uploadBestHyperparameterFileInputRef}
                      id="upload-best-hyperparameter-file"
                      className="library-file-picker__input"
                      type="file"
                      accept=".xlsx"
                      onChange={(event) => setUploadBestHyperparameterFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="library-file-picker__trigger"
                      onClick={() => uploadBestHyperparameterFileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        <path
                          d="M17 15V18M17 21V18M17 18H14M17 18H20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>Choose file</span>
                    </button>
                    <span className="library-file-picker__name">
                      {uploadBestHyperparameterFile ? uploadBestHyperparameterFile.name : '(Optional)'}
                    </span>
                  </div>
                  <span className="status-note">Stored as Best_hyperparamter.xlsx.</span>
                </div>
                </div>

                {uploadError ? <div className="library-modal__error">{uploadError}</div> : null}

                <div className="library-modal__actions">
                  <button
                    type="button"
                    className="btn library-action-btn library-action-btn--white"
                    onClick={closeUploadModal}
                    disabled={isUploading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn library-action-btn library-action-btn--green"
                    onClick={() => void handleUploadSubmit()}
                    disabled={isUploading}
                  >
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : null}
    </div>
  )
}
