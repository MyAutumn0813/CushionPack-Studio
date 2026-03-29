import { useEffect, useState } from 'react'
import {
  parseApiResponse,
  requestApi,
  type ShapWaterfallResponse,
  type ShapWaterfallStep,
  type TaskHistoryDetail,
  type TaskHistoryDetailResponse,
  type TaskHistoryItem,
  type TaskResultRow,
  type WaterfallData,
  normalizeTaskResultRows,
} from '../taskHistory'
import { buildExportFileName, exportRowsToWorkbook } from '../export'

type TaskHistoryDetailModalProps = {
  open: boolean
  task: TaskHistoryItem | null
  onClose: () => void
  onBack?: () => void
}

const formatChartValue = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '--')
const formatContribution = (value: number) => `${value >= 0 ? '+' : ''}${formatChartValue(value, 2)}`

export default function TaskHistoryDetailModal({
  open,
  task,
  onClose,
  onBack,
}: TaskHistoryDetailModalProps) {
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [taskDetail, setTaskDetail] = useState<TaskHistoryDetail | null>(null)
  const [waterfallData, setWaterfallData] = useState<WaterfallData | null>(null)
  const [hoveredWaterfallStepIndex, setHoveredWaterfallStepIndex] = useState<number | null>(null)
  const [isGeneratingShapRowId, setIsGeneratingShapRowId] = useState('')
  const [shapError, setShapError] = useState('')
  const [isExportingResults, setIsExportingResults] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    if (!open || !task) {
      setIsLoadingDetail(false)
      setDetailError('')
      setTaskDetail(null)
      setWaterfallData(null)
      setHoveredWaterfallStepIndex(null)
      setIsGeneratingShapRowId('')
      setShapError('')
      setIsExportingResults(false)
      setExportError('')
      return
    }

    let disposed = false
    const loadTaskDetail = async () => {
      setIsLoadingDetail(true)
      setDetailError('')
      setTaskDetail(null)
      setWaterfallData(null)
      setHoveredWaterfallStepIndex(null)
      setIsGeneratingShapRowId('')
      setShapError('')
      setIsExportingResults(false)
      setExportError('')

      try {
        const detailQuery = new URLSearchParams({
          fileName: task.fileName,
        })
        if (task.projectName) {
          detailQuery.set('projectName', task.projectName)
        }
        const response = await requestApi(`/api/new-task/task-detail?${detailQuery.toString()}`)
        const payload = await parseApiResponse<TaskHistoryDetailResponse>(response)
        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to load task detail.')
        }

        if (!disposed) {
          setTaskDetail({
            fileName: String(payload.fileName ?? task.fileName).trim() || task.fileName,
            taskName: String(payload.taskName ?? task.taskName).trim() || task.taskName,
            productType: String(payload.productType ?? '').trim(),
            productName: String(payload.productName ?? '').trim(),
            isMultiple: payload.isMultiple === true || task.isMultiple,
            projectName: String(payload.projectName ?? task.projectName ?? '').trim(),
            predictedResultsFileName: String(payload.predictedResultsFileName ?? '').trim(),
            canGenerateShap: payload.canGenerateShap === true,
            taskResults: normalizeTaskResultRows(payload.taskResults),
          })
        }
      } catch (loadError) {
        if (!disposed) {
          setDetailError(loadError instanceof Error ? loadError.message : 'Failed to load task detail.')
        }
      } finally {
        if (!disposed) {
          setIsLoadingDetail(false)
        }
      }
    }

    void loadTaskDetail()
    return () => {
      disposed = true
    }
  }, [open, task])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onBack) {
          onBack()
          return
        }
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onBack, onClose, open])

  const handleShapClick = async (row: TaskResultRow) => {
    if (!taskDetail?.fileName) {
      setShapError('Task file context is unavailable for SHAP generation.')
      return
    }

    if (!taskDetail.productType || !taskDetail.productName) {
      setShapError('This historical task is missing Product type/Product name context for SHAP generation.')
      return
    }

    setShapError('')
    setIsGeneratingShapRowId(row.id)

    try {
      const response = await requestApi('/api/new-task/shap-waterfall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productType: taskDetail.productType,
          projectName: taskDetail.projectName,
          fileName: taskDetail.fileName,
          targetId: row.id,
          planPreview: {
            productName: taskDetail.productName,
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

      setWaterfallData({
        targetId: String(payload.targetId ?? row.id).trim() || row.id,
        baseline,
        prediction,
        steps: nextSteps,
      })
      setHoveredWaterfallStepIndex(null)
    } catch (error) {
      setWaterfallData(null)
      setHoveredWaterfallStepIndex(null)
      setShapError(error instanceof Error ? error.message : 'Failed to generate SHAP waterfall plot.')
    } finally {
      setIsGeneratingShapRowId('')
    }
  }

  const handleExportTaskResults = async () => {
    if (!taskDetail || taskDetail.taskResults.length < 1) {
      setExportError('No task result data is available to export.')
      return
    }

    setIsExportingResults(true)
    setExportError('')
    try {
      await exportRowsToWorkbook({
        fileName: buildExportFileName(taskDetail.predictedResultsFileName || `${taskDetail.taskName}_task result.xlsx`, 'Task result'),
        sheetName: 'Task result',
        columns: [
          { label: 'ID', value: (row: TaskResultRow) => row.id },
          { label: 'Predicted acceleration', value: (row: TaskResultRow) => row.predictedAcceleration },
          { label: 'Predicted result', value: (row: TaskResultRow) => row.predictedResult },
        ],
        rows: taskDetail.taskResults,
      })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Failed to export task results.')
    } finally {
      setIsExportingResults(false)
    }
  }

  if (!open || !task) {
    return null
  }

  const waterfallSteps = waterfallData?.steps ?? []
  const chartWidth = 980
  const chartMargin = { top: 30, right: 40, bottom: 56, left: 280 }
  const chartRowHeight = 40
  const chartBarHeight = 24
  const chartHeight = chartMargin.top + Math.max(waterfallSteps.length, 1) * chartRowHeight + chartMargin.bottom
  const plotWidth = chartWidth - chartMargin.left - chartMargin.right
  const allChartValues = waterfallData
    ? [waterfallData.baseline, waterfallData.prediction, ...waterfallSteps.flatMap((step) => [step.start, step.end])]
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
  const scaleX = (value: number) => chartMargin.left + ((value - domainMin) / (domainMax - domainMin)) * plotWidth
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
    <div className="search-modal-backdrop search-modal-backdrop--detail" onClick={onClose}>
      <section
        className="search-modal search-modal--detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-history-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="search-modal__header search-modal__header--detail">
          <div className="search-modal__detail-nav">
            {onBack ? (
              <button type="button" className="search-modal__back" aria-label="Back to task list" onClick={onBack}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
            <div className="search-modal__detail-heading">
              <h2 id="task-history-detail-title" className="search-modal__detail-title">
                {taskDetail?.taskName || task.taskName}
              </h2>
              <div className="search-modal__detail-meta">
                {(taskDetail?.isMultiple ?? task.isMultiple) ? 'Multiple tasks' : 'Single task'} | {task.fileName}
              </div>
            </div>
          </div>
          <button type="button" className="search-modal__close" aria-label="Close task detail" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 6l12 12" strokeLinecap="round" />
              <path d="M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="search-modal__body search-modal__body--detail">
          {isLoadingDetail ? <div className="search-modal__status">Loading task detail...</div> : null}
          {!isLoadingDetail && detailError ? (
            <div className="search-modal__status search-modal__status--error">{detailError}</div>
          ) : null}

          {!isLoadingDetail && !detailError && taskDetail ? (
            <div className="search-task-detail">
              <div className="search-task-detail__summary">
                <div className="search-task-detail__summary-card">
                  <span className="search-task-detail__summary-label">Project</span>
                  <span className="search-task-detail__summary-value">{taskDetail.projectName || 'General'}</span>
                </div>
                <div className="search-task-detail__summary-card">
                  <span className="search-task-detail__summary-label">Product type</span>
                  <span className="search-task-detail__summary-value">{taskDetail.productType || '--'}</span>
                </div>
                <div className="search-task-detail__summary-card">
                  <span className="search-task-detail__summary-label">Product name</span>
                  <span className="search-task-detail__summary-value">{taskDetail.productName || '--'}</span>
                </div>
                <div className="search-task-detail__summary-card">
                  <span className="search-task-detail__summary-label">Result file</span>
                  <span className="search-task-detail__summary-value">
                    {taskDetail.predictedResultsFileName || '--'}
                  </span>
                </div>
              </div>

              <div className="task-result-panel">
                <div className="task-result-panel__header">
                  <h4 className="card-title">Task result</h4>
                  <button
                    type="button"
                    className="btn task-action-button task-result-panel__export"
                    onClick={() => void handleExportTaskResults()}
                    disabled={taskDetail.taskResults.length < 1 || isExportingResults}
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
                      {taskDetail.taskResults.length > 0 ? (
                        taskDetail.taskResults.map((row) => (
                          <tr key={row.id}>
                            <td>{row.id}</td>
                            <td>{row.predictedAcceleration.toFixed(3)}</td>
                            <td>{row.predictedResult}</td>
                            <td>
                              <div className="task-result-explanation">
                                <button
                                  type="button"
                                  className="task-result-shap-button"
                                  onClick={() => void handleShapClick(row)}
                                  disabled={!taskDetail.canGenerateShap || isGeneratingShapRowId.length > 0}
                                >
                                  {isGeneratingShapRowId === row.id ? 'Generating...' : 'SHAP'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4}>No saved task result rows were found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {exportError ? <div className="task-result-panel__error">{exportError}</div> : null}
                {!taskDetail.canGenerateShap ? (
                  <div className="search-task-detail__note">
                    SHAP is unavailable because this historical task cannot be matched to a saved Product type/Product
                    name.
                  </div>
                ) : null}
              </div>

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
                      <div className="task-result-waterfall__hint">
                        Hover a bar to inspect SHAP contribution details.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="task-result-waterfall__placeholder">
                    Click SHAP to generate partial explanation diagram.
                  </div>
                )}
                {shapError ? <div className="search-task-detail__note">{shapError}</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
