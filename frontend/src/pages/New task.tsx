import { Fragment, useEffect, useRef, useState, type ChangeEvent } from 'react'

import { downloadApiFile, normalizeInput, parseApiResponse, requestApi } from '../features/api'
import { buildExportFileName, exportRowsToWorkbook } from '../features/export'
import DropdownSelect from '../features/components/DropdownSelect'

type ApiMessage = {
  message?: string
}

type ProductTypesResponse = ApiMessage & {
  productTypes?: string[]
}

type ProductFolderPayload = {
  folderId: string
  folderName: string
}

type ProductsResponse = ApiMessage & {
  folders?: ProductFolderPayload[]
}

type StartPredictionResponse = ApiMessage & {
  message?: string
  taskName?: string
  fileName?: string
  filePath?: string
  predictedResultsFileName?: string
  predictedResultsPath?: string
  taskResults?: Array<{
    id?: string
    predictedAcceleration?: number
    predictedResult?: string
    resultExplanation?: string
  }>
}

type ShapWaterfallStep = {
  feature: string
  featureValue: string
  contribution: number
  start: number
  end: number
  direction: 'positive' | 'negative'
}

type ShapWaterfallResponse = ApiMessage & {
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

type ProductNameOption = {
  id: string
  name: string
}

type TaskResultRow = {
  id: string
  predictedAcceleration: number
  predictedResult: string
  resultExplanation: string
}

type TaskMode = 'single' | 'multiple'

type WaterfallData = {
  targetId: string
  baseline: number
  prediction: number
  steps: ShapWaterfallStep[]
}

type ProductFormState = {
  id: string
  fragility: number
  mass: number
  length: number
  width: number
  height: number
}

type BufferFormState = {
  material: string
  density: number
  thickness: number
}

type OuterFormState = {
  material: string
  length: number
  width: number
  height: number
}

type UploadedSchemePreview = {
  fileName: string
  sheetName: string
  headers: string[]
  rows: string[][]
  totalRows: number
}

const defaultProduct: ProductFormState = {
  id: '',
  fragility: 0,
  mass: 7.11,
  length: 890,
  width: 525,
  height: 75,
}

const defaultBuffer: BufferFormState = {
  material: 'EPE',
  density: 30,
  thickness: 2,
}

const defaultOuter: OuterFormState = {
  material: 'Corrugated paper',
  length: 900,
  width: 500,
  height: 600,
}

const SUPPORTED_UPLOAD_EXTENSIONS = new Set(['csv', 'xlsx'])
const uniqueSorted = (items: string[]) =>
  [...new Set(items.map((item) => item.trim()).filter((item) => item.length > 0))].sort((left, right) =>
    left.localeCompare(right),
  )

const stringifyUploadCell = (value: unknown) => {
  if (value == null) {
    return ''
  }
  return String(value)
}

const buildUploadPreview = (sheetRows: unknown[][]) => {
  const normalizedRows = sheetRows
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => stringifyUploadCell(cell)))
    .filter((row) => row.some((cell) => normalizeInput(cell).length > 0))

  if (normalizedRows.length < 1) {
    throw new Error('Uploaded file has no visible rows.')
  }

  const maxColumnCount = Math.max(...normalizedRows.map((row) => row.length), 1)
  const matrix = normalizedRows.map((row) =>
    Array.from({ length: maxColumnCount }, (_, index) => row[index] ?? ''),
  )
  const headers = matrix[0].map((cell, index) => normalizeInput(cell) || `Column ${index + 1}`)
  const dataRows = matrix.slice(1)

  return {
    headers,
    rows: dataRows,
    totalRows: dataRows.length,
  }
}

function TaskRegionIcon() {
  return (
    <svg className="task-region-tab__icon" viewBox="0 0 16 19" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 18C7 18.5523 7.44772 19 8 19C8.55228 19 9 18.5523 9 18H7ZM8.70711 0.292893C8.31658 -0.0976311 7.68342 -0.0976311 7.29289 0.292893L0.928932 6.65685C0.538408 7.04738 0.538408 7.68054 0.928932 8.07107C1.31946 8.46159 1.95262 8.46159 2.34315 8.07107L8 2.41421L13.6569 8.07107C14.0474 8.46159 14.6805 8.46159 15.0711 8.07107C15.4616 7.68054 15.4616 7.04738 15.0711 6.65685L8.70711 0.292893ZM9 18L9 1H7L7 18H9Z" />
    </svg>
  )
}

type NewTaskPageProps = {
  pageTitle?: string
  projectName?: string
}

export default function NewTaskPage({ pageTitle = 'New task', projectName = '' }: NewTaskPageProps) {
  const [activeTaskRegion, setActiveTaskRegion] = useState<'single' | 'multiple'>('single')
  const [taskName, setTaskName] = useState('')
  const [productTypes, setProductTypes] = useState<string[]>([])
  const [selectedProductType, setSelectedProductType] = useState('')
  const [productNames, setProductNames] = useState<ProductNameOption[]>([])
  const [selectedProductNameId, setSelectedProductNameId] = useState('')
  const [isLoadingProductTypes, setIsLoadingProductTypes] = useState(false)
  const [isLoadingProductNames, setIsLoadingProductNames] = useState(false)
  const [classificationError, setClassificationError] = useState('')
  const [isStartingPrediction, setIsStartingPrediction] = useState(false)
  const [singleStartPredictionError, setSingleStartPredictionError] = useState('')
  const [multipleStartPredictionError, setMultipleStartPredictionError] = useState('')
  const [multipleTemplateError, setMultipleTemplateError] = useState('')
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false)
  const [singleTaskResultRows, setSingleTaskResultRows] = useState<TaskResultRow[]>([])
  const [multipleTaskResultRows, setMultipleTaskResultRows] = useState<TaskResultRow[]>([])
  const [singleLatestTaskFileName, setSingleLatestTaskFileName] = useState('')
  const [multipleLatestTaskFileName, setMultipleLatestTaskFileName] = useState('')
  const [singlePredictedResultsFileName, setSinglePredictedResultsFileName] = useState('')
  const [multiplePredictedResultsFileName, setMultiplePredictedResultsFileName] = useState('')
  const [singleIsExportingResults, setSingleIsExportingResults] = useState(false)
  const [multipleIsExportingResults, setMultipleIsExportingResults] = useState(false)
  const [singleExportError, setSingleExportError] = useState('')
  const [multipleExportError, setMultipleExportError] = useState('')
  const [singleWaterfallData, setSingleWaterfallData] = useState<WaterfallData | null>(null)
  const [multipleWaterfallData, setMultipleWaterfallData] = useState<WaterfallData | null>(null)
  const [singleHoveredWaterfallStepIndex, setSingleHoveredWaterfallStepIndex] = useState<number | null>(null)
  const [multipleHoveredWaterfallStepIndex, setMultipleHoveredWaterfallStepIndex] = useState<number | null>(null)
  const [singleIsGeneratingShapRowId, setSingleIsGeneratingShapRowId] = useState('')
  const [multipleIsGeneratingShapRowId, setMultipleIsGeneratingShapRowId] = useState('')
  const [singleShapError, setSingleShapError] = useState('')
  const [multipleShapError, setMultipleShapError] = useState('')
  const [product, setProduct] = useState<ProductFormState>(defaultProduct)
  const [buffer, setBuffer] = useState<BufferFormState>(defaultBuffer)
  const [outer, setOuter] = useState<OuterFormState>(defaultOuter)
  const [productDraft, setProductDraft] = useState<ProductFormState>(defaultProduct)
  const [bufferDraft, setBufferDraft] = useState<BufferFormState>(defaultBuffer)
  const [outerDraft, setOuterDraft] = useState<OuterFormState>(defaultOuter)
  const [isSingleSchemeConfigured, setIsSingleSchemeConfigured] = useState(false)
  const [isSingleTaskModalOpen, setIsSingleTaskModalOpen] = useState(false)
  const [uploadedSchemePreview, setUploadedSchemePreview] = useState<UploadedSchemePreview | null>(null)
  const [uploadedSchemeFile, setUploadedSchemeFile] = useState<File | null>(null)
  const [uploadSchemeError, setUploadSchemeError] = useState('')
  const [isReadingSchemeFile, setIsReadingSchemeFile] = useState(false)
  const uploadSchemeInputRef = useRef<HTMLInputElement | null>(null)

  const syncProductNames = async (productType: string, preferredFolderId?: string) => {
    const normalizedType = normalizeInput(productType)
    if (!normalizedType) {
      setProductNames([])
      setSelectedProductNameId('')
      return []
    }

    setIsLoadingProductNames(true)
    try {
      const response = await requestApi(`/api/library/products?productType=${encodeURIComponent(normalizedType)}`)
      const payload = await parseApiResponse<ProductsResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load product names.')
      }

      const nextProductNames = (payload.folders ?? [])
        .map((folder) => ({
          id: folder.folderId,
          name: folder.folderName,
        }))
        .filter((folder) => folder.id && folder.name)

      setProductNames(nextProductNames)
      setSelectedProductNameId((current) => {
        if (preferredFolderId && nextProductNames.some((folder) => folder.id === preferredFolderId)) {
          return preferredFolderId
        }
        if (nextProductNames.some((folder) => folder.id === current)) {
          return current
        }
        return nextProductNames[0]?.id ?? ''
      })
      return nextProductNames
    } catch (error) {
      setClassificationError(error instanceof Error ? error.message : 'Failed to load product names.')
      setProductNames([])
      setSelectedProductNameId('')
      return []
    } finally {
      setIsLoadingProductNames(false)
    }
  }

  const syncProductTypes = async (preferredType?: string) => {
    setIsLoadingProductTypes(true)
    setClassificationError('')
    try {
      const response = await requestApi('/api/library/product-types')
      const payload = await parseApiResponse<ProductTypesResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load product types.')
      }

      const nextProductTypes = uniqueSorted(payload.productTypes ?? [])
      setProductTypes(nextProductTypes)

      const nextSelectedType =
        (preferredType && nextProductTypes.includes(preferredType) && preferredType) ||
        (selectedProductType && nextProductTypes.includes(selectedProductType) && selectedProductType) ||
        nextProductTypes[0] ||
        ''

      setSelectedProductType(nextSelectedType)
      if (nextSelectedType) {
        await syncProductNames(nextSelectedType)
      } else {
        setProductNames([])
        setSelectedProductNameId('')
      }
    } catch (error) {
      setClassificationError(error instanceof Error ? error.message : 'Failed to load product types.')
      setProductTypes([])
      setSelectedProductType('')
      setProductNames([])
      setSelectedProductNameId('')
    } finally {
      setIsLoadingProductTypes(false)
    }
  }

  const previewSections = [
    {
      title: 'Product',
      rows: [
        { label: 'Product ID', value: isSingleSchemeConfigured ? product.id || '--' : '--' },
        { label: 'Product fragility (g)', value: isSingleSchemeConfigured ? product.fragility : '--' },
        { label: 'Product mass (kg)', value: isSingleSchemeConfigured ? product.mass : '--' },
        { label: 'Product length (cm)', value: isSingleSchemeConfigured ? product.length : '--' },
        { label: 'Product width (cm)', value: isSingleSchemeConfigured ? product.width : '--' },
        { label: 'Product height (cm)', value: isSingleSchemeConfigured ? product.height : '--' },
      ],
    },
    {
      title: 'Outer packaging',
      rows: [
        { label: 'Packing material', value: isSingleSchemeConfigured ? outer.material || '--' : '--' },
        { label: 'Material length (cm)', value: isSingleSchemeConfigured ? outer.length : '--' },
        { label: 'Material width (cm)', value: isSingleSchemeConfigured ? outer.width : '--' },
        { label: 'Material height (cm)', value: isSingleSchemeConfigured ? outer.height : '--' },
      ],
    },
    {
      title: 'Cushion material',
      rows: [
        { label: 'Liner category', value: isSingleSchemeConfigured ? buffer.material || '--' : '--' },
        { label: 'Liner density (kg/m3)', value: isSingleSchemeConfigured ? buffer.density : '--' },
        { label: 'Liner thickness (cm)', value: isSingleSchemeConfigured ? buffer.thickness : '--' },
      ],
    },
  ]

  useEffect(() => {
    if (!isSingleTaskModalOpen) {
      return
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSingleTaskModalOpen(false)
      }
    }

    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isSingleTaskModalOpen])

  useEffect(() => {
    void syncProductTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTaskTypeChange = (nextType: string) => {
    setSelectedProductType(nextType)
    setClassificationError('')
    void syncProductNames(nextType)
  }

  const handleOpenSingleTaskModal = () => {
    setProductDraft({ ...product })
    setBufferDraft({ ...buffer })
    setOuterDraft({ ...outer })
    setIsSingleTaskModalOpen(true)
  }

  const handleCancelSingleTaskModal = () => {
    setProductDraft({ ...product })
    setBufferDraft({ ...buffer })
    setOuterDraft({ ...outer })
    setIsSingleTaskModalOpen(false)
  }

  const handlePreviewSingleTaskModal = () => {
    setProduct({ ...productDraft })
    setBuffer({ ...bufferDraft })
    setOuter({ ...outerDraft })
    setIsSingleSchemeConfigured(true)
    setIsSingleTaskModalOpen(false)
  }

  const handleOpenUploadScheme = () => {
    setUploadSchemeError('')
    uploadSchemeInputRef.current?.click()
  }

  const handleUploadSchemeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) {
      return
    }

    const fileName = normalizeInput(selectedFile.name)
    const fileExtension = fileName.toLowerCase().split('.').pop() ?? ''
    if (!SUPPORTED_UPLOAD_EXTENSIONS.has(fileExtension)) {
      setUploadedSchemeFile(null)
      setUploadedSchemePreview(null)
      setUploadSchemeError('Only .xlsx and .csv files are supported.')
      return
    }

    setIsReadingSchemeFile(true)
    setUploadSchemeError('')
    try {
      const XLSX = await import('xlsx')
      const fileBuffer = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(fileBuffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      if (!firstSheetName) {
        throw new Error('No worksheet found in uploaded file.')
      }

      const firstSheet = workbook.Sheets[firstSheetName]
      const sheetRows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      }) as unknown[][]
      const preview = buildUploadPreview(sheetRows)

      setUploadedSchemePreview({
        fileName,
        sheetName: firstSheetName,
        headers: preview.headers,
        rows: preview.rows,
        totalRows: preview.totalRows,
      })
      setUploadedSchemeFile(selectedFile)
    } catch (error) {
      setUploadedSchemeFile(null)
      setUploadedSchemePreview(null)
      setUploadSchemeError(error instanceof Error ? error.message : 'Failed to parse uploaded scheme file.')
    } finally {
      setIsReadingSchemeFile(false)
    }
  }

  const handleShapClick = async (mode: TaskMode, row: TaskResultRow) => {
    const latestTaskFileName = mode === 'multiple' ? multipleLatestTaskFileName : singleLatestTaskFileName
    const selectedProductName =
      productNames.find((productName) => productName.id === selectedProductNameId)?.name ?? ''

    if (!selectedProductType || !selectedProductName) {
      if (mode === 'multiple') {
        setMultipleShapError('Please select Product type/Product name before generating SHAP plot.')
      } else {
        setSingleShapError('Please select Product type/Product name before generating SHAP plot.')
      }
      return
    }
    if (!latestTaskFileName) {
      if (mode === 'multiple') {
        setMultipleShapError('Please run Start prediction before generating SHAP plot.')
      } else {
        setSingleShapError('Please run Start prediction before generating SHAP plot.')
      }
      return
    }

    if (mode === 'multiple') {
      setMultipleShapError('')
      setMultipleIsGeneratingShapRowId(row.id)
    } else {
      setSingleShapError('')
      setSingleIsGeneratingShapRowId(row.id)
    }

    try {
      const response = await requestApi('/api/new-task/shap-waterfall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productType: selectedProductType,
          projectName,
          fileName: latestTaskFileName,
          targetId: row.id,
          planPreview: {
            productName: selectedProductName,
          },
        }),
      })
      const payload = await parseApiResponse<ShapWaterfallResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to generate SHAP waterfall plot.')
      }

      const baseline = Number(payload.baseline)
      const prediction = Number(payload.prediction)
      if (!Number.isFinite(baseline) || !Number.isFinite(prediction)) {
        throw new Error('SHAP waterfall baseline/prediction is invalid.')
      }

      let running = baseline
      const nextSteps = (Array.isArray(payload.steps) ? payload.steps : [])
        .map((step, index) => {
          const contribution = Number(step?.contribution)
          if (!Number.isFinite(contribution)) {
            return null
          }
          const feature = String(step?.feature ?? '').trim() || `Feature ${index + 1}`
          const featureValueRaw = String(step?.featureValue ?? '').trim()
          const startRaw = Number(step?.start)
          const endRaw = Number(step?.end)
          const start = Number.isFinite(startRaw) ? startRaw : running
          const end = Number.isFinite(endRaw) ? endRaw : start + contribution
          running = end
          return {
            feature,
            featureValue: featureValueRaw || '--',
            contribution,
            start,
            end,
            direction: contribution >= 0 ? 'positive' : 'negative',
          } as ShapWaterfallStep
        })
        .filter((step): step is ShapWaterfallStep => step !== null)

      if (nextSteps.length < 1) {
        throw new Error('SHAP waterfall steps are empty.')
      }

      const nextWaterfallData: WaterfallData = {
        targetId: String(payload.targetId ?? row.id).trim() || row.id,
        baseline,
        prediction,
        steps: nextSteps,
      }
      if (mode === 'multiple') {
        setMultipleWaterfallData(nextWaterfallData)
        setMultipleHoveredWaterfallStepIndex(null)
      } else {
        setSingleWaterfallData(nextWaterfallData)
        setSingleHoveredWaterfallStepIndex(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate SHAP waterfall plot.'
      if (mode === 'multiple') {
        setMultipleWaterfallData(null)
        setMultipleHoveredWaterfallStepIndex(null)
        setMultipleShapError(message)
      } else {
        setSingleWaterfallData(null)
        setSingleHoveredWaterfallStepIndex(null)
        setSingleShapError(message)
      }
    } finally {
      if (mode === 'multiple') {
        setMultipleIsGeneratingShapRowId('')
      } else {
        setSingleIsGeneratingShapRowId('')
      }
    }
  }

  const resetPredictionResultState = (mode: TaskMode) => {
    if (mode === 'multiple') {
      setMultipleTaskResultRows([])
      setMultipleLatestTaskFileName('')
      setMultiplePredictedResultsFileName('')
      setMultipleIsExportingResults(false)
      setMultipleExportError('')
      setMultipleWaterfallData(null)
      setMultipleHoveredWaterfallStepIndex(null)
      setMultipleShapError('')
      return
    }

    setSingleTaskResultRows([])
    setSingleLatestTaskFileName('')
    setSinglePredictedResultsFileName('')
    setSingleIsExportingResults(false)
    setSingleExportError('')
    setSingleWaterfallData(null)
    setSingleHoveredWaterfallStepIndex(null)
    setSingleShapError('')
  }

  const handleStartPrediction = async (mode: TaskMode) => {
    const isMultipleMode = mode === 'multiple'
    const setModeStartPredictionError = isMultipleMode ? setMultipleStartPredictionError : setSingleStartPredictionError
    const normalizedTaskName = normalizeInput(taskName)
    const normalizedProductId = normalizeInput(product.id)
    const selectedProductName =
      productNames.find((productName) => productName.id === selectedProductNameId)?.name ?? ''
    if (!normalizedTaskName) {
      setModeStartPredictionError('Please enter Task name before starting prediction.')
      resetPredictionResultState(mode)
      return
    }
    if (!selectedProductType) {
      setModeStartPredictionError('Please select Product type before starting prediction.')
      resetPredictionResultState(mode)
      return
    }
    if (!selectedProductName) {
      setModeStartPredictionError('Please select Product name before starting prediction.')
      resetPredictionResultState(mode)
      return
    }
    if (!isMultipleMode && !normalizedProductId) {
      setModeStartPredictionError('Please enter Product ID before starting prediction.')
      resetPredictionResultState(mode)
      return
    }
    if (isMultipleMode && !uploadedSchemeFile) {
      setModeStartPredictionError('Please upload a `.xlsx` or `.csv` scheme file before starting prediction.')
      resetPredictionResultState(mode)
      return
    }

    setIsStartingPrediction(true)
    setModeStartPredictionError('')
    resetPredictionResultState(mode)
    try {
      const response = isMultipleMode
        ? await (async () => {
            const schemeFile = uploadedSchemeFile
            if (!schemeFile) {
              throw new Error('Please upload a `.xlsx` or `.csv` scheme file before starting prediction.')
            }
            const formData = new FormData()
            formData.set('taskName', normalizedTaskName)
            formData.set('productType', selectedProductType)
            formData.set('productName', selectedProductName)
            if (projectName) {
              formData.set('projectName', projectName)
            }
            formData.set('schemeFile', schemeFile, schemeFile.name || 'scheme.xlsx')
            return requestApi('/api/new-task/start-multiple-prediction', {
              method: 'POST',
              body: formData,
            })
          })()
        : await requestApi('/api/new-task/start-prediction', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              taskName: normalizedTaskName,
              projectName,
              productType: selectedProductType,
              planPreview: {
                productId: normalizedProductId,
                productName: selectedProductName,
                productMass: product.mass,
                tvLength: product.length,
                tvWidth: product.width,
                tvHeight: product.height,
                linerCategory: buffer.material,
                linerDensity: buffer.density,
                linerThickness: buffer.thickness,
                peakAcceleration: product.fragility,
              },
            }),
          })
      const payload = await parseApiResponse<StartPredictionResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to export prediction file.')
      }

      const nextTaskResults = Array.isArray(payload.taskResults)
        ? payload.taskResults
            .map((row) => ({
              id: String(row?.id ?? '').trim(),
              predictedAcceleration: Number(row?.predictedAcceleration),
              predictedResult: String(row?.predictedResult ?? '').trim(),
              resultExplanation: String(row?.resultExplanation ?? '').trim(),
            }))
            .filter(
              (row) =>
                row.id.length > 0 &&
                Number.isFinite(row.predictedAcceleration) &&
                row.predictedResult.length > 0,
            )
        : []
      if (isMultipleMode) {
        setMultipleTaskResultRows(nextTaskResults)
        setMultipleLatestTaskFileName(typeof payload.fileName === 'string' ? payload.fileName.trim() : '')
        setMultiplePredictedResultsFileName(
          typeof payload.predictedResultsFileName === 'string' ? payload.predictedResultsFileName.trim() : '',
        )
      } else {
        setSingleTaskResultRows(nextTaskResults)
        setSingleLatestTaskFileName(typeof payload.fileName === 'string' ? payload.fileName.trim() : '')
        setSinglePredictedResultsFileName(
          typeof payload.predictedResultsFileName === 'string' ? payload.predictedResultsFileName.trim() : '',
        )
      }

      window.dispatchEvent(new CustomEvent('bp:task-history-updated'))
    } catch (error) {
      resetPredictionResultState(mode)
      setModeStartPredictionError(error instanceof Error ? error.message : 'Failed to export prediction file.')
    } finally {
      setIsStartingPrediction(false)
    }
  }

  const handleExportTaskResults = async (mode: TaskMode) => {
    const isMultipleMode = mode === 'multiple'
    const taskResultRows = isMultipleMode ? multipleTaskResultRows : singleTaskResultRows
    const predictedResultsFileName = isMultipleMode ? multiplePredictedResultsFileName : singlePredictedResultsFileName
    const latestTaskFileName = isMultipleMode ? multipleLatestTaskFileName : singleLatestTaskFileName
    const setIsExportingResults = isMultipleMode ? setMultipleIsExportingResults : setSingleIsExportingResults
    const setExportError = isMultipleMode ? setMultipleExportError : setSingleExportError

    if (taskResultRows.length < 1) {
      setExportError('Run Start prediction to export task results.')
      return
    }

    setIsExportingResults(true)
    setExportError('')
    try {
      const fallbackBaseName = latestTaskFileName
        ? latestTaskFileName.replace(/\.xlsx$/i, '_predicted results.xlsx')
        : `Task result ${isMultipleMode ? 'multiple' : 'single'}.xlsx`

      await exportRowsToWorkbook({
        fileName: buildExportFileName(predictedResultsFileName || fallbackBaseName, 'Task result'),
        sheetName: 'Task result',
        columns: [
          { label: 'ID', value: (row: TaskResultRow) => row.id },
          { label: 'Predicted acceleration', value: (row: TaskResultRow) => row.predictedAcceleration },
          { label: 'Predicted result', value: (row: TaskResultRow) => row.predictedResult },
        ],
        rows: taskResultRows,
      })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Failed to export task results.')
    } finally {
      setIsExportingResults(false)
    }
  }

  const formatChartValue = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '--')
  const formatContribution = (value: number) => `${value >= 0 ? '+' : ''}${formatChartValue(value, 2)}`

  const renderTaskResultTable = (mode: TaskMode) => {
    const taskResultRows = mode === 'multiple' ? multipleTaskResultRows : singleTaskResultRows
    const isGeneratingShapRowId = mode === 'multiple' ? multipleIsGeneratingShapRowId : singleIsGeneratingShapRowId
    const isExportingResults = mode === 'multiple' ? multipleIsExportingResults : singleIsExportingResults
    const exportError = mode === 'multiple' ? multipleExportError : singleExportError

    return (
    <div className="task-result-panel">
      <div className="task-result-panel__header">
        <h4 className="card-title">Task result</h4>
        <button
          type="button"
          className="btn task-action-button task-result-panel__export"
          onClick={() => void handleExportTaskResults(mode)}
          disabled={taskResultRows.length < 1 || isExportingResults}
        >
          {isExportingResults ? 'Exporting...' : 'Export'}
        </button>
      </div>
      <div className="table-scroll">
        <table className="table task-result-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Predicted acceleration</th>
              <th>Predicted result</th>
              <th>Result explanation</th>
            </tr>
          </thead>
          <tbody>
            {taskResultRows.length > 0 ? (
              taskResultRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.predictedAcceleration.toFixed(3)}</td>
                  <td>{row.predictedResult}</td>
                  <td>
                    <div className="task-result-explanation">
                      <button
                        type="button"
                        className="task-result-shap-button"
                        onClick={() => void handleShapClick(mode, row)}
                        disabled={isGeneratingShapRowId.length > 0}
                      >
                        {isGeneratingShapRowId === row.id ? 'Generating...' : 'SHAP'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Run Start prediction to show task results.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {exportError ? <div className="task-result-panel__error">{exportError}</div> : null}
    </div>
    )
  }

  const renderExplanationDiagram = (mode: TaskMode) => {
    const waterfallData = mode === 'multiple' ? multipleWaterfallData : singleWaterfallData
    const hoveredWaterfallStepIndex =
      mode === 'multiple' ? multipleHoveredWaterfallStepIndex : singleHoveredWaterfallStepIndex
    const setHoveredWaterfallStepIndex =
      mode === 'multiple' ? setMultipleHoveredWaterfallStepIndex : setSingleHoveredWaterfallStepIndex
    const shapError = mode === 'multiple' ? multipleShapError : singleShapError

    const waterfallSteps = waterfallData?.steps ?? []
    const chartWidth = 980
    const chartMargin = { top: 30, right: 40, bottom: 56, left: 280 }
    const chartRowHeight = 40
    const chartBarHeight = 24
    const chartHeight = chartMargin.top + Math.max(waterfallSteps.length, 1) * chartRowHeight + chartMargin.bottom
    const plotWidth = chartWidth - chartMargin.left - chartMargin.right
    const allChartValues = waterfallData
      ? [
          waterfallData.baseline,
          waterfallData.prediction,
          ...waterfallSteps.flatMap((step) => [step.start, step.end]),
        ]
      : [0, 1]
    let chartMin = Math.min(...allChartValues)
    let chartMax = Math.max(...allChartValues)
    if (!Number.isFinite(chartMin) || !Number.isFinite(chartMax) || chartMin === chartMax) {
      chartMin = 0
      chartMax = 1
    }
    const chartPadding = (chartMax - chartMin) * 0.08 || 1
    const domainMin = chartMin - chartPadding
    const domainMax = chartMax + chartPadding
    const scaleX = (value: number) =>
      chartMargin.left + ((value - domainMin) / (domainMax - domainMin)) * plotWidth
    const tickCount = 6
    const xTicks = Array.from(
      { length: tickCount + 1 },
      (_, index) => domainMin + ((domainMax - domainMin) * index) / tickCount,
    )
    const baselineX = scaleX(waterfallData?.baseline ?? domainMin)
    const predictionX = scaleX(waterfallData?.prediction ?? domainMin)
    const activeWaterfallStep =
      hoveredWaterfallStepIndex != null && hoveredWaterfallStepIndex >= 0
        ? waterfallSteps[hoveredWaterfallStepIndex] ?? null
        : null

    return (
    <div className="task-result-waterfall">
      <h5 className="task-result-waterfall__title">Explanation diagram</h5>
      {waterfallData ? (
        <div className="task-result-waterfall__chart-shell">
          <svg
            className="task-result-waterfall__svg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label={`Interactive SHAP waterfall for ID ${waterfallData.targetId}`}
          >
            <g className="task-result-waterfall__grid">
              {xTicks.map((tickValue, index) => {
                const x = scaleX(tickValue)
                return (
                  <g key={`tick-${index}`}>
                    <line
                      x1={x}
                      y1={chartMargin.top - 6}
                      x2={x}
                      y2={chartHeight - chartMargin.bottom + 8}
                      className="task-result-waterfall__grid-line"
                    />
                    <text
                      x={x}
                      y={chartHeight - chartMargin.bottom + 24}
                      textAnchor="middle"
                      className="task-result-waterfall__tick"
                    >
                      {formatChartValue(tickValue, 1)}
                    </text>
                  </g>
                )
              })}
            </g>

            <line
              x1={baselineX}
              y1={chartMargin.top - 12}
              x2={baselineX}
              y2={chartHeight - chartMargin.bottom + 6}
              className="task-result-waterfall__reference-line"
            />
            <line
              x1={predictionX}
              y1={chartMargin.top - 12}
              x2={predictionX}
              y2={chartHeight - chartMargin.bottom + 6}
              className="task-result-waterfall__reference-line"
            />
            <text
              x={baselineX}
              y={chartHeight - 12}
              textAnchor="middle"
              className="task-result-waterfall__reference-text"
            >
              {`E[f(x)] = ${formatChartValue(waterfallData.baseline, 1)}`}
            </text>
            <text
              x={predictionX}
              y={chartMargin.top - 16}
              textAnchor="middle"
              className="task-result-waterfall__reference-text"
            >
              {`f(x) = ${formatChartValue(waterfallData.prediction, 1)}`}
            </text>

            {waterfallSteps.map((step, index) => {
              const yCenter = chartMargin.top + index * chartRowHeight + chartRowHeight / 2
              const startX = scaleX(step.start)
              const endX = scaleX(step.end)
              const x = Math.min(startX, endX)
              const width = Math.max(Math.abs(endX - startX), 2)
              const isActive = hoveredWaterfallStepIndex === index
              return (
                <g
                  key={`${step.feature}-${index}`}
                  className={`task-result-waterfall__bar-group${isActive ? ' is-active' : ''}`}
                  onMouseEnter={() => setHoveredWaterfallStepIndex(index)}
                  onMouseLeave={() => setHoveredWaterfallStepIndex(null)}
                >
                  <title>{`${step.feature} = ${step.featureValue}, contribution ${formatContribution(step.contribution)}`}</title>
                  <text
                    x={chartMargin.left - 12}
                    y={yCenter + 4}
                    textAnchor="end"
                    className="task-result-waterfall__feature-text"
                  >
                    {`${step.feature} = ${step.featureValue}`}
                  </text>
                  <rect
                    x={x}
                    y={yCenter - chartBarHeight / 2}
                    width={width}
                    height={chartBarHeight}
                    rx={8}
                    className={`task-result-waterfall__bar task-result-waterfall__bar--${step.direction}`}
                  />
                  <text
                    x={x + width / 2}
                    y={yCenter + 5}
                    textAnchor="middle"
                    className={`task-result-waterfall__bar-label task-result-waterfall__bar-label--${step.direction}`}
                  >
                    {formatContribution(step.contribution)}
                  </text>
                </g>
              )
            })}
          </svg>

          {activeWaterfallStep ? (
            <div className="task-result-waterfall__hint">
              {`Feature: ${activeWaterfallStep.feature} (${activeWaterfallStep.featureValue}), contribution: ${formatContribution(activeWaterfallStep.contribution)}, path: ${formatChartValue(activeWaterfallStep.start, 2)} -> ${formatChartValue(activeWaterfallStep.end, 2)}`}
            </div>
          ) : (
            <div className="task-result-waterfall__hint">Hover a bar to inspect SHAP contribution details.</div>
          )}
        </div>
      ) : (
        <div className="task-result-waterfall__placeholder">
          Click SHAP to generate partial explanation diagram.
        </div>
      )}
      {shapError ? <div className="status-note task-classification-error">{shapError}</div> : null}
    </div>
    )
  }

  const renderSinglePreviewPanel = () => (
    <aside className="task-panel task-panel--preview task-panel--single-preview">
      <div className="form-block">
        <h3 className="card-title">Cushion packaging scheme</h3>
        <div className="table-scroll task-preview-main-scroll">
          <table className="table">
            <tbody>
              {previewSections.map((section) => (
                <Fragment key={section.title}>
                  <tr className="task-preview-section-row">
                    <th scope="rowgroup" colSpan={2}>
                      {section.title}
                    </th>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={`${section.title}-${row.label}`}>
                      <th scope="row">{row.label}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  )

  const handleDownloadTemplate = async () => {
    setMultipleTemplateError('')
    setIsDownloadingTemplate(true)
    try {
      await downloadApiFile('/api/new-task/multiple-template', 'Multiple tasks template.xlsx')
    } catch (error) {
      setMultipleTemplateError(error instanceof Error ? error.message : 'Failed to download template.')
    } finally {
      setIsDownloadingTemplate(false)
    }
  }

  const renderMultiplePreviewPanel = () => (
    <aside className="task-panel task-panel--preview task-panel--multiple-preview">
      <div className="form-block">
        <div className="task-preview-header">
          <h3 className="card-title">Cushion packaging scheme</h3>
          <button
            type="button"
            className="task-preview-template-link"
            aria-label="Download multiple tasks template"
            onClick={() => void handleDownloadTemplate()}
            disabled={isDownloadingTemplate}
          >
            {isDownloadingTemplate ? 'Downloading...' : 'Download template'}
          </button>
        </div>
        {multipleTemplateError ? <div className="task-preview-template-status">{multipleTemplateError}</div> : null}
        <div className="task-upload-preview">
          {uploadedSchemePreview ? (
            <>
              <div className="task-upload-preview__meta">
                {`File: ${uploadedSchemePreview.fileName} | Sheet: ${uploadedSchemePreview.sheetName} | Rows: ${uploadedSchemePreview.totalRows}`}
              </div>
              {uploadedSchemePreview.rows.length > 0 ? (
                <div className="task-multiple-upload-window">
                  <table className="table task-upload-preview__table task-multiple-upload-table">
                    <thead>
                      <tr>
                        {uploadedSchemePreview.headers.map((header, index) => (
                          <th key={`upload-header-${index}`}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedSchemePreview.rows.map((row, rowIndex) => (
                        <tr key={`upload-row-${rowIndex}`}>
                          {row.map((value, cellIndex) => (
                            <td key={`upload-row-${rowIndex}-cell-${cellIndex}`}>{value || '--'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="task-upload-preview__placeholder">
                  This file only has header rows and no data rows.
                </div>
              )}
            </>
          ) : (
            <div className="task-upload-preview__placeholder">
              Upload a `.xlsx` or `.csv` scheme file to preview here.
            </div>
          )}
          {uploadSchemeError ? (
            <div className="status-note task-classification-error">{uploadSchemeError}</div>
          ) : null}
        </div>
      </div>
    </aside>
  )

  const renderSingleLauncherPanel = () => (
    <div className="task-panel task-panel--launcher task-panel--single-launcher">
      <div className="form-block">
        <div className="task-launcher-stack">
          <div className="task-launcher-section">
            <h4 className="card-title">Single task</h4>
            <div className="form-row">
              <label htmlFor="single-task-name-input">Task name</label>
              <input
                id="single-task-name-input"
                className="input"
                type="text"
                value={taskName}
                placeholder="Enter task name"
                onChange={(event) => setTaskName(event.target.value)}
              />
            </div>
          </div>

          <div className="task-launcher-section">
            <h4 className="card-title">Product Classification</h4>
            <div className="task-classification-grid">
              <div className="form-row">
                <label htmlFor="single-task-product-type">Product type</label>
                <DropdownSelect
                  id="single-task-product-type"
                  className="select"
                  value={selectedProductType}
                  onChange={(event) => handleTaskTypeChange(event.target.value)}
                  disabled={isLoadingProductTypes || productTypes.length === 0}
                >
                  {isLoadingProductTypes ? (
                    <option value="">Loading product types...</option>
                  ) : productTypes.length === 0 ? (
                    <option value="">No product type available</option>
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
                <label htmlFor="single-task-product-name">Product name</label>
                <DropdownSelect
                  id="single-task-product-name"
                  className="select"
                  value={selectedProductNameId}
                  onChange={(event) => setSelectedProductNameId(event.target.value)}
                  disabled={!selectedProductType || isLoadingProductNames || productNames.length === 0}
                >
                  {!selectedProductType ? (
                    <option value="">Select product type first</option>
                  ) : isLoadingProductNames ? (
                    <option value="">Loading product names...</option>
                  ) : productNames.length === 0 ? (
                    <option value="">No product name available</option>
                  ) : (
                    productNames.map((productName) => (
                      <option key={productName.id} value={productName.id}>
                        {productName.name}
                      </option>
                    ))
                  )}
                </DropdownSelect>
              </div>
            </div>
            {classificationError ? (
              <div className="status-note task-classification-error">{classificationError}</div>
            ) : null}
          </div>
        </div>

        <div className="task-mode-actions">
          <button
            type="button"
            className="btn task-mode-button task-action-button"
            onClick={handleOpenSingleTaskModal}
            disabled={isStartingPrediction}
          >
            Input scheme
          </button>
          <button
            type="button"
            className="btn task-mode-button task-action-button"
            onClick={() => void handleStartPrediction('single')}
            disabled={isStartingPrediction}
          >
            {isStartingPrediction ? 'Saving...' : 'Start prediction'}
          </button>
        </div>
        {singleStartPredictionError ? (
          <div className="status-note task-classification-error">{singleStartPredictionError}</div>
        ) : null}
      </div>
    </div>
  )

  const renderMultipleLauncherPanel = () => (
    <div className="task-panel task-panel--launcher task-panel--multiple-launcher">
      <div className="form-block">
        <div className="task-launcher-stack">
          <div className="task-launcher-section">
            <h4 className="card-title">Multiple tasks</h4>
            <div className="form-row">
              <label htmlFor="multiple-task-name-input">Task name</label>
              <input
                id="multiple-task-name-input"
                className="input"
                type="text"
                value={taskName}
                placeholder="Enter task name"
                onChange={(event) => setTaskName(event.target.value)}
              />
            </div>
          </div>

          <div className="task-launcher-section">
            <h4 className="card-title">Product Classification</h4>
            <div className="task-classification-grid">
              <div className="form-row">
                <label htmlFor="multiple-task-product-type">Product type</label>
                <DropdownSelect
                  id="multiple-task-product-type"
                  className="select"
                  value={selectedProductType}
                  onChange={(event) => handleTaskTypeChange(event.target.value)}
                  disabled={isLoadingProductTypes || productTypes.length === 0}
                >
                  {isLoadingProductTypes ? (
                    <option value="">Loading product types...</option>
                  ) : productTypes.length === 0 ? (
                    <option value="">No product type available</option>
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
                <label htmlFor="multiple-task-product-name">Product name</label>
                <DropdownSelect
                  id="multiple-task-product-name"
                  className="select"
                  value={selectedProductNameId}
                  onChange={(event) => setSelectedProductNameId(event.target.value)}
                  disabled={!selectedProductType || isLoadingProductNames || productNames.length === 0}
                >
                  {!selectedProductType ? (
                    <option value="">Select product type first</option>
                  ) : isLoadingProductNames ? (
                    <option value="">Loading product names...</option>
                  ) : productNames.length === 0 ? (
                    <option value="">No product name available</option>
                  ) : (
                    productNames.map((productName) => (
                      <option key={productName.id} value={productName.id}>
                        {productName.name}
                      </option>
                    ))
                  )}
                </DropdownSelect>
              </div>
            </div>
            {classificationError ? (
              <div className="status-note task-classification-error">{classificationError}</div>
            ) : null}
          </div>
        </div>

        <div className="task-mode-actions">
          <input
            ref={uploadSchemeInputRef}
            type="file"
            className="task-upload-input"
            accept=".csv,.xlsx"
            onChange={(event) => void handleUploadSchemeFile(event)}
          />
          <button
            type="button"
            className="btn task-mode-button task-action-button"
            onClick={handleOpenUploadScheme}
            disabled={isReadingSchemeFile || isStartingPrediction}
          >
            {isReadingSchemeFile ? 'Reading...' : 'Upload scheme'}
          </button>
          <button
            type="button"
            className="btn task-mode-button task-action-button"
            onClick={() => void handleStartPrediction('multiple')}
            disabled={isStartingPrediction}
          >
            {isStartingPrediction ? 'Saving...' : 'Start prediction'}
          </button>
        </div>
        {multipleStartPredictionError ? (
          <div className="status-note task-classification-error">{multipleStartPredictionError}</div>
        ) : null}
      </div>
    </div>
  )

  const renderTaskWorkspace = (mode: 'single' | 'multiple') => {
    if (mode === 'multiple') {
      return (
        <div className="task-layout task-layout--multiple">
          {renderMultipleLauncherPanel()}
          {renderMultiplePreviewPanel()}
          <div className="task-panel task-panel--result task-panel--multiple-result">
            {renderTaskResultTable('multiple')}
          </div>
          <div className="task-panel task-panel--explanation task-panel--multiple-explanation">
            {renderExplanationDiagram('multiple')}
          </div>
        </div>
      )
    }

    return (
      <div className="task-layout task-layout--single">
        {renderSingleLauncherPanel()}
        {renderSinglePreviewPanel()}
        <div className="task-panel task-panel--result task-panel--single-result">
          {renderTaskResultTable('single')}
          {renderExplanationDiagram('single')}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <section className="page-section">
        <div className="section-header">
          <h2>{pageTitle}</h2>
          <div className="task-region-tabs" role="tablist" aria-label="Task mode switch">
            <button
              type="button"
              className={`task-region-tab${activeTaskRegion === 'single' ? ' is-active' : ''}`}
              onClick={() => setActiveTaskRegion('single')}
            >
              <span className="task-region-tab__label">Single task</span>
              <TaskRegionIcon />
            </button>
            <button
              type="button"
              className={`task-region-tab${activeTaskRegion === 'multiple' ? ' is-active' : ''}`}
              onClick={() => setActiveTaskRegion('multiple')}
            >
              <span className="task-region-tab__label">Multiple tasks</span>
              <TaskRegionIcon />
            </button>
          </div>
        </div>

        {activeTaskRegion === 'single' ? (
          <div className="task-region-shell task-region-shell--single">
            {renderTaskWorkspace('single')}
          </div>
        ) : (
          <div className="task-region-shell task-region-shell--multiple">
            {renderTaskWorkspace('multiple')}
          </div>
        )}
      </section>

      {isSingleTaskModalOpen ? (
        <div className="task-modal-backdrop" onClick={() => setIsSingleTaskModalOpen(false)}>
          <div
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="single-task-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="task-modal__header">
              <h2 id="single-task-modal-title" className="card-title">
                Input scheme
              </h2>
              <button
                type="button"
                className="task-modal__close"
                aria-label="Close single task dialog"
                onClick={handleCancelSingleTaskModal}
              >
                X
              </button>
            </div>
            <div className="task-modal__body">
              <div className="task-form-stack">
                <div className="form-block">
                  <h3 className="card-title">Product</h3>
                  <div className="form-grid">
                    <div className="form-row">
                      <label htmlFor="product-id">Product ID</label>
                      <input
                        id="product-id"
                        className="input"
                        type="text"
                        value={productDraft.id}
                        placeholder="Enter product ID"
                        onChange={(event) =>
                          setProductDraft((prev) => ({ ...prev, id: event.target.value }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="product-fragility">Product fragility</label>
                      <input
                        id="product-fragility"
                        className="input"
                        type="number"
                        value={productDraft.fragility}
                        min={0}
                        step={0.01}
                        onChange={(event) =>
                          setProductDraft((prev) => ({ ...prev, fragility: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="product-mass">Product mass (kg)</label>
                      <input
                        id="product-mass"
                        className="input"
                        type="number"
                        value={productDraft.mass}
                        min={0}
                        step={0.01}
                        onChange={(event) =>
                          setProductDraft((prev) => ({ ...prev, mass: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="product-length">Product length (cm)</label>
                      <input
                        id="product-length"
                        className="input"
                        type="number"
                        value={productDraft.length}
                        min={0}
                        step={0.1}
                        onChange={(event) =>
                          setProductDraft((prev) => ({ ...prev, length: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="product-width">Product width (cm)</label>
                      <input
                        id="product-width"
                        className="input"
                        type="number"
                        value={productDraft.width}
                        min={0}
                        step={0.1}
                        onChange={(event) =>
                          setProductDraft((prev) => ({ ...prev, width: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="product-height">Product height (cm)</label>
                      <input
                        id="product-height"
                        className="input"
                        type="number"
                        value={productDraft.height}
                        min={0}
                        step={0.1}
                        onChange={(event) =>
                          setProductDraft((prev) => ({ ...prev, height: Number(event.target.value) }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="form-block">
                  <h3 className="card-title">Outer packaging</h3>
                  <div className="form-grid">
                    <div className="form-row">
                      <label htmlFor="outer-material">Packing material</label>
                      <DropdownSelect
                        id="outer-material"
                        className="select"
                        value={outerDraft.material}
                        onChange={(event) =>
                          setOuterDraft((prev) => ({ ...prev, material: event.target.value }))
                        }
                      >
                        <option value="Corrugated paper">Corrugated paper</option>
                        <option value="Honeycomb paper">Others</option>
                      </DropdownSelect>
                    </div>
                    <div className="form-row">
                      <label htmlFor="outer-length">Material length (cm)</label>
                      <input
                        id="outer-length"
                        className="input"
                        type="number"
                        value={outerDraft.length}
                        min={0}
                        step={0.1}
                        onChange={(event) =>
                          setOuterDraft((prev) => ({ ...prev, length: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="outer-width">Material width (cm)</label>
                      <input
                        id="outer-width"
                        className="input"
                        type="number"
                        value={outerDraft.width}
                        min={0}
                        step={0.1}
                        onChange={(event) =>
                          setOuterDraft((prev) => ({ ...prev, width: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="outer-height">Material height (cm)</label>
                      <input
                        id="outer-height"
                        className="input"
                        type="number"
                        value={outerDraft.height}
                        min={0}
                        step={0.1}
                        onChange={(event) =>
                          setOuterDraft((prev) => ({ ...prev, height: Number(event.target.value) }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="form-block">
                  <h3 className="card-title">Cushion material</h3>
                  <div className="form-grid">
                    <div className="form-row">
                      <label htmlFor="liner-material">Liner category</label>
                      <DropdownSelect
                        id="liner-material"
                        className="select"
                        value={bufferDraft.material}
                        onChange={(event) =>
                          setBufferDraft((prev) => ({ ...prev, material: event.target.value }))
                        }
                      >
                        <option value="EPE">EPE</option>
                        <option value="EPP">EPP</option>
                        <option value="EPS">EPS</option>
                      </DropdownSelect>
                    </div>
                    <div className="form-row">
                      <label htmlFor="linerdensity">Liner density (kg/m3)</label>
                      <input
                        id="linerdensity"
                        className="input"
                        type="number"
                        value={bufferDraft.density}
                        min={0}
                        step={1}
                        onChange={(event) =>
                          setBufferDraft((prev) => ({ ...prev, density: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="Liner-thickness">Liner thickness (cm)</label>
                      <input
                        id="liner-thickness"
                        className="input"
                        type="number"
                        value={bufferDraft.thickness}
                        min={0}
                        step={0.1}
                        onChange={(event) =>
                          setBufferDraft((prev) => ({ ...prev, thickness: Number(event.target.value) }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="task-modal__actions">
              <button type="button" className="task-modal-action task-modal-action--cancel" onClick={handleCancelSingleTaskModal}>
                Cancel
              </button>
              <button type="button" className="task-modal-action task-modal-action--preview" onClick={handlePreviewSingleTaskModal}>
                Preview
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
