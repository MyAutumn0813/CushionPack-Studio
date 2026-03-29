import { useEffect, useMemo, useState } from 'react'
import DropdownSelect from '../features/components/DropdownSelect'
import { parseApiResponse, requestApi } from '../features/api'
import { buildExportFileName, exportRowsToWorkbook } from '../features/export'

type ExploreMaterialCategory = 'EPE' | 'EPP' | 'EPS'

type ExploreActiveProduct = {
  productType: string
  productName: string
  folderId: string
  activeModel: {
    version: string
    fileName: string
    finalModelFileName: string
    uploadedAt: string
  }
}

type ExploreActiveProductsResponse = {
  message?: string
  productTypes?: string[]
  items?: ExploreActiveProduct[]
}

type ExploreGridRow = {
  category: ExploreMaterialCategory
  density: number
  thickness: number
  predictedAcceleration: number
  feasible: boolean
  materialUsage: number
}

type ExploreBestRow = {
  category: ExploreMaterialCategory
  density: number | null
  thickness: number | null
  predictedAcceleration: number | null
  materialUsage: number | null
  feasibleCount: number
}

type ExploreReverseDesignResponse = {
  message?: string
  productType?: string
  productName?: string
  activeModel?: {
    version?: string
    fileName?: string
    uploadedAt?: string
  }
  summary?: {
    totalPoints?: number
    feasiblePoints?: number
    threshold?: number
    densityStep?: number
    thicknessStep?: number
  }
  gridRows?: ExploreGridRow[]
  bestByCategory?: ExploreBestRow[]
  bestOverall?: ExploreBestRow | null
}

type ExploreReverseDesignResult = {
  productType: string
  productName: string
  activeModel: {
    version: string
    fileName: string
    uploadedAt: string
  }
  summary: {
    totalPoints: number
    feasiblePoints: number
    threshold: number
    densityStep: number
    thicknessStep: number
  }
  gridRows: ExploreGridRow[]
  bestByCategory: ExploreBestRow[]
  bestOverall: ExploreBestRow | null
}

type ExploreRangeDraft = {
  category: ExploreMaterialCategory
  densityMin: string
  densityMax: string
  thicknessMin: string
  thicknessMax: string
}

const MATERIAL_ORDER: ExploreMaterialCategory[] = ['EPE', 'EPP', 'EPS']

const DEFAULT_FIXED_INPUTS = {
  tvLength: '500',
  tvWidth: '580',
  tvHeight: '75',
  productMass: '8',
}

const DEFAULT_THRESHOLD = '60'
const DEFAULT_DENSITY_STEP = '1'
const DEFAULT_THICKNESS_STEP = '2'

const DEFAULT_RANGE_DRAFTS: ExploreRangeDraft[] = [
  { category: 'EPE', densityMin: '5', densityMax: '40', thicknessMin: '5', thicknessMax: '100' },
  { category: 'EPP', densityMin: '5', densityMax: '50', thicknessMin: '5', thicknessMax: '100' },
  { category: 'EPS', densityMin: '5', densityMax: '50', thicknessMin: '5', thicknessMax: '100' },
]

const formatMetric = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? '--' : value.toFixed(digits)

const formatInteger = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '--' : value.toLocaleString()

const parseNumeric = (value: string) => Number(String(value ?? '').trim())

const clampRatio = (value: number) => Math.min(1, Math.max(0, value))

const buildHeatColor = (value: number, min: number, max: number, feasible: boolean) => {
  const span = max - min
  const normalized = span > 0 ? clampRatio((value - min) / span) : 0.5
  const hue = 214 - normalized * 182
  const saturation = feasible ? 80 : 58
  const lightness = feasible ? 58 - normalized * 12 : 42 - normalized * 8
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

const pickTickValues = (values: number[], maxCount = 6) => {
  if (values.length <= maxCount) {
    return values
  }

  const step = Math.max(1, Math.ceil(values.length / maxCount))
  return values.filter((_, index) => index % step === 0 || index === values.length - 1)
}

function ExploreFeasibleDomainChart({
  points,
  hoveredPoint,
  onHover,
}: {
  points: ExploreGridRow[]
  hoveredPoint: ExploreGridRow | null
  onHover: (point: ExploreGridRow | null) => void
}) {
  if (points.length < 1) {
    return (
      <div className="plot-placeholder explore-domain-chart__empty">
        Run reverse design to generate an interactive feasible domain plot.
      </div>
    )
  }

  const densities = Array.from(new Set(points.map((point) => point.density))).sort((left, right) => left - right)
  const thicknesses = Array.from(new Set(points.map((point) => point.thickness))).sort((left, right) => left - right)
  const xIndexMap = new Map(densities.map((value, index) => [value, index]))
  const yIndexMap = new Map(thicknesses.map((value, index) => [value, index]))
  const predictions = points.map((point) => point.predictedAcceleration)
  const minPrediction = Math.min(...predictions)
  const maxPrediction = Math.max(...predictions)
  const width = 560
  const height = 340
  const marginLeft = 58
  const marginRight = 16
  const marginTop = 18
  const marginBottom = 48
  const plotWidth = width - marginLeft - marginRight
  const plotHeight = height - marginTop - marginBottom
  const cellWidth = plotWidth / Math.max(densities.length, 1)
  const cellHeight = plotHeight / Math.max(thicknesses.length, 1)
  const xTicks = pickTickValues(densities)
  const yTicks = pickTickValues(thicknesses)

  return (
    <div className="explore-domain-chart">
      <svg className="explore-domain-chart__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Feasible domain heatmap">
        <line x1={marginLeft} y1={marginTop + plotHeight} x2={width - marginRight} y2={marginTop + plotHeight} className="explore-domain-chart__axis" />
        <line x1={marginLeft} y1={marginTop} x2={marginLeft} y2={marginTop + plotHeight} className="explore-domain-chart__axis" />

        {points.map((point) => {
          const xIndex = xIndexMap.get(point.density) ?? 0
          const yIndex = yIndexMap.get(point.thickness) ?? 0
          const y = marginTop + (thicknesses.length - 1 - yIndex) * cellHeight
          const x = marginLeft + xIndex * cellWidth
          const isHovered =
            hoveredPoint?.category === point.category &&
            hoveredPoint?.density === point.density &&
            hoveredPoint?.thickness === point.thickness

          return (
            <rect
              key={`${point.category}-${point.density}-${point.thickness}`}
              x={x}
              y={y}
              width={Math.max(cellWidth - 0.3, 1)}
              height={Math.max(cellHeight - 0.3, 1)}
              rx={cellWidth > 9 && cellHeight > 9 ? 1.6 : 0}
              fill={buildHeatColor(point.predictedAcceleration, minPrediction, maxPrediction, point.feasible)}
              stroke={isHovered ? 'rgba(255,255,255,0.96)' : point.feasible ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.06)'}
              strokeWidth={isHovered ? 1.6 : point.feasible ? 0.8 : 0.4}
              onMouseEnter={() => onHover(point)}
              onMouseLeave={() => onHover(null)}
            />
          )
        })}

        {xTicks.map((tick) => {
          const xIndex = xIndexMap.get(tick) ?? 0
          const x = marginLeft + xIndex * cellWidth + cellWidth / 2
          return (
            <g key={`x-${tick}`}>
              <line x1={x} y1={marginTop + plotHeight} x2={x} y2={marginTop + plotHeight + 6} className="explore-domain-chart__tick" />
              <text x={x} y={height - 16} textAnchor="middle" className="explore-domain-chart__tick-label">
                {tick}
              </text>
            </g>
          )
        })}

        {yTicks.map((tick) => {
          const yIndex = yIndexMap.get(tick) ?? 0
          const y = marginTop + (thicknesses.length - 1 - yIndex) * cellHeight + cellHeight / 2
          return (
            <g key={`y-${tick}`}>
              <line x1={marginLeft - 6} y1={y} x2={marginLeft} y2={y} className="explore-domain-chart__tick" />
              <text x={marginLeft - 12} y={y + 4} textAnchor="end" className="explore-domain-chart__tick-label">
                {tick}
              </text>
            </g>
          )
        })}

        <text x={marginLeft + plotWidth / 2} y={height - 2} textAnchor="middle" className="explore-domain-chart__axis-label">
          Liner density
        </text>
        <text
          x={18}
          y={marginTop + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 18 ${marginTop + plotHeight / 2})`}
          className="explore-domain-chart__axis-label"
        >
          Liner thickness
        </text>
      </svg>

      <div className="explore-domain-chart__legend">
        <div className="explore-domain-chart__legend-scale" />
        <div className="explore-domain-chart__legend-meta">
          <span>{formatMetric(minPrediction, 1)} g</span>
          <span>Predicted peak acceleration</span>
          <span>{formatMetric(maxPrediction, 1)} g</span>
        </div>
      </div>
    </div>
  )
}

export default function ExplorePage() {
  const [activeProducts, setActiveProducts] = useState<ExploreActiveProduct[]>([])
  const [selectedProductType, setSelectedProductType] = useState('')
  const [selectedProductName, setSelectedProductName] = useState('')
  const [fixedInputs, setFixedInputs] = useState(DEFAULT_FIXED_INPUTS)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [densityStep, setDensityStep] = useState(DEFAULT_DENSITY_STEP)
  const [thicknessStep, setThicknessStep] = useState(DEFAULT_THICKNESS_STEP)
  const [parameterRanges, setParameterRanges] = useState(DEFAULT_RANGE_DRAFTS)
  const [hoveredPoint, setHoveredPoint] = useState<ExploreGridRow | null>(null)
  const [activeMaterial, setActiveMaterial] = useState<ExploreMaterialCategory>('EPE')
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [result, setResult] = useState<ExploreReverseDesignResult | null>(null)
  const [isExportingDomainData, setIsExportingDomainData] = useState(false)
  const [exportDomainError, setExportDomainError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadOptions = async () => {
      setIsLoadingOptions(true)
      setOptionsError('')
      try {
        const response = await requestApi('/api/explore/active-products')
        const payload = await parseApiResponse<ExploreActiveProductsResponse>(response)
        if (!response.ok) {
          throw new Error(payload.message ?? 'Failed to load active Explore products.')
        }

        if (cancelled) {
          return
        }

        const items = Array.isArray(payload.items) ? payload.items : []
        setActiveProducts(items)
        if (items.length > 0) {
          setSelectedProductType((current) => (current && items.some((item) => item.productType === current) ? current : items[0].productType))
        } else {
          setSelectedProductType('')
          setSelectedProductName('')
        }
      } catch (error) {
        if (!cancelled) {
          setActiveProducts([])
          setOptionsError(error instanceof Error ? error.message : 'Failed to load active Explore products.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOptions(false)
        }
      }
    }

    void loadOptions()

    return () => {
      cancelled = true
    }
  }, [])

  const availableProductTypes = useMemo(
    () => Array.from(new Set(activeProducts.map((item) => item.productType))),
    [activeProducts],
  )

  const availableProducts = useMemo(
    () => activeProducts.filter((item) => item.productType === selectedProductType),
    [activeProducts, selectedProductType],
  )

  const selectedProduct = useMemo(
    () => availableProducts.find((item) => item.productName === selectedProductName) ?? availableProducts[0] ?? null,
    [availableProducts, selectedProductName],
  )

  useEffect(() => {
    if (!selectedProductType && availableProductTypes.length > 0) {
      setSelectedProductType(availableProductTypes[0])
    }
  }, [availableProductTypes, selectedProductType])

  useEffect(() => {
    if (availableProducts.length < 1) {
      setSelectedProductName('')
      return
    }

    if (!availableProducts.some((item) => item.productName === selectedProductName)) {
      setSelectedProductName(availableProducts[0].productName)
    }
  }, [availableProducts, selectedProductName])

  const materialPoints = useMemo(() => {
    if (!result) {
      return []
    }

    return result.gridRows.filter((row) => row.category === activeMaterial)
  }, [activeMaterial, result])

  useEffect(() => {
    if (!result) {
      setActiveMaterial('EPE')
      setHoveredPoint(null)
      return
    }

    const availableMaterials = Array.from(new Set(result.gridRows.map((row) => row.category))) as ExploreMaterialCategory[]
    if (!availableMaterials.includes(activeMaterial)) {
      setActiveMaterial(availableMaterials[0] ?? 'EPE')
    }
    setHoveredPoint(null)
  }, [activeMaterial, result])

  const handleRangeChange = (
    category: ExploreMaterialCategory,
    field: 'densityMin' | 'densityMax' | 'thicknessMin' | 'thicknessMax',
    value: string,
  ) => {
    setParameterRanges((current) =>
      current.map((row) => (row.category === category ? { ...row, [field]: value } : row)),
    )
  }

  const handleRunReverseDesign = async () => {
    if (!selectedProduct) {
      setRunError('No active product model is available for Explore.')
      setResult(null)
      return
    }

    const tvLength = parseNumeric(fixedInputs.tvLength)
    const tvWidth = parseNumeric(fixedInputs.tvWidth)
    const tvHeight = parseNumeric(fixedInputs.tvHeight)
    const productMass = parseNumeric(fixedInputs.productMass)
    const thresholdValue = parseNumeric(threshold)
    const densityStepValue = parseNumeric(densityStep)
    const thicknessStepValue = parseNumeric(thicknessStep)
    const rangePayload = parameterRanges.map((row) => ({
      category: row.category,
      densityMin: parseNumeric(row.densityMin),
      densityMax: parseNumeric(row.densityMax),
      thicknessMin: parseNumeric(row.thicknessMin),
      thicknessMax: parseNumeric(row.thicknessMax),
    }))

    const numericInputs = [tvLength, tvWidth, tvHeight, productMass, thresholdValue, densityStepValue, thicknessStepValue]
    if (!numericInputs.every((value) => Number.isFinite(value))) {
      setRunError('Product information and search settings must all be numeric.')
      return
    }

    if (productMass <= 0) {
      setRunError('Mass must be greater than zero.')
      return
    }

    if (densityStepValue <= 0 || thicknessStepValue <= 0) {
      setRunError('Search step values must be greater than zero.')
      return
    }

    const invalidRange = rangePayload.find(
      (row) =>
        !Number.isFinite(row.densityMin) ||
        !Number.isFinite(row.densityMax) ||
        !Number.isFinite(row.thicknessMin) ||
        !Number.isFinite(row.thicknessMax) ||
        row.densityMin > row.densityMax ||
        row.thicknessMin > row.thicknessMax,
    )
    if (invalidRange) {
      setRunError(`Parameter range for ${invalidRange.category} is invalid.`)
      return
    }

    setIsRunning(true)
    setRunError('')

    try {
      const response = await requestApi('/api/explore/reverse-design', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productType: selectedProduct.productType,
          productName: selectedProduct.productName,
          fixedInputs: {
            tvLength,
            tvWidth,
            tvHeight,
            productMass,
          },
          threshold: thresholdValue,
          densityStep: densityStepValue,
          thicknessStep: thicknessStepValue,
          parameterRanges: rangePayload,
        }),
      })

      const payload = await parseApiResponse<ExploreReverseDesignResponse>(response)
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to run reverse design.')
      }

      const normalizedResult: ExploreReverseDesignResult = {
        productType: String(payload.productType ?? selectedProduct.productType).trim(),
        productName: String(payload.productName ?? selectedProduct.productName).trim(),
        activeModel: {
          version: String(payload.activeModel?.version ?? selectedProduct.activeModel.version).trim(),
          fileName: String(payload.activeModel?.fileName ?? selectedProduct.activeModel.fileName).trim(),
          uploadedAt: String(payload.activeModel?.uploadedAt ?? selectedProduct.activeModel.uploadedAt).trim(),
        },
        summary: {
          totalPoints: Number(payload.summary?.totalPoints ?? 0),
          feasiblePoints: Number(payload.summary?.feasiblePoints ?? 0),
          threshold: Number(payload.summary?.threshold ?? thresholdValue),
          densityStep: Number(payload.summary?.densityStep ?? densityStepValue),
          thicknessStep: Number(payload.summary?.thicknessStep ?? thicknessStepValue),
        },
        gridRows: Array.isArray(payload.gridRows) ? payload.gridRows : [],
        bestByCategory: Array.isArray(payload.bestByCategory) ? payload.bestByCategory : [],
        bestOverall: payload.bestOverall ?? null,
      }

      setResult(normalizedResult)
      const nextMaterial =
        normalizedResult.bestOverall?.category ??
        normalizedResult.bestByCategory.find((row) => row.feasibleCount > 0)?.category ??
        'EPE'
      setActiveMaterial(nextMaterial)
    } catch (error) {
      setResult(null)
      setRunError(error instanceof Error ? error.message : 'Failed to run reverse design.')
    } finally {
      setIsRunning(false)
    }
  }

  const handleExportDomainData = async () => {
    if (materialPoints.length < 1) {
      setExportDomainError('Run reverse design to export feasible domain data.')
      return
    }

    setIsExportingDomainData(true)
    setExportDomainError('')
    try {
      const fileName = buildExportFileName(
        `${result?.productName || 'Explore'}_${activeMaterial}_feasible_domain_plot.xlsx`,
        'Feasible domain plot',
      )

      await exportRowsToWorkbook({
        fileName,
        sheetName: `${activeMaterial} domain`,
        columns: [
          { label: 'Material', value: (row: ExploreGridRow) => row.category },
          { label: 'Density', value: (row: ExploreGridRow) => row.density },
          { label: 'Thickness', value: (row: ExploreGridRow) => row.thickness },
          { label: 'Predicted acceleration', value: (row: ExploreGridRow) => row.predictedAcceleration },
          { label: 'Feasible', value: (row: ExploreGridRow) => (row.feasible ? 'Yes' : 'No') },
          { label: 'Material usage', value: (row: ExploreGridRow) => row.materialUsage },
        ],
        rows: materialPoints,
      })
    } catch (error) {
      setExportDomainError(error instanceof Error ? error.message : 'Failed to export feasible domain data.')
    } finally {
      setIsExportingDomainData(false)
    }
  }

  const bestRows =
    result?.bestByCategory ??
    DEFAULT_RANGE_DRAFTS.map((row) => ({
      category: row.category,
      density: null,
      thickness: null,
      predictedAcceleration: null,
      materialUsage: null,
      feasibleCount: 0,
    }))

  return (
    <div className="page explore-page">
      <section className="page-section">
        <div className="section-header">
          <div>
            <h2>Explore</h2>
          </div>
        </div>

        <div className="explore-config-grid">
          <div className="explore-left-stack">
            <section className="card explore-card">
              <div className="explore-card__header">
                <h3 className="card-title">Product model</h3>
                {selectedProduct ? <span className="library-status-badge is-ready">Active model</span> : null}
              </div>

              {isLoadingOptions ? <div className="status-note">Loading active models from backend...</div> : null}
              {optionsError ? <div className="status-note library-cross-validation__error">{optionsError}</div> : null}

              <div className="explore-form-grid">
                <div className="form-row">
                  <label htmlFor="explore-product-type">Product type</label>
                  <DropdownSelect
                    id="explore-product-type"
                    className="select"
                    value={selectedProductType}
                    onChange={(event) => setSelectedProductType(event.target.value)}
                    disabled={availableProductTypes.length < 1}
                  >
                    {availableProductTypes.length < 1 ? (
                      <option value="">No active product type</option>
                    ) : (
                      availableProductTypes.map((productType) => (
                        <option key={productType} value={productType}>
                          {productType}
                        </option>
                      ))
                    )}
                  </DropdownSelect>
                </div>

                <div className="form-row">
                  <label htmlFor="explore-product-name">Product name</label>
                  <DropdownSelect
                    id="explore-product-name"
                    className="select"
                    value={selectedProduct?.productName ?? ''}
                    onChange={(event) => setSelectedProductName(event.target.value)}
                    disabled={availableProducts.length < 1}
                  >
                    {availableProducts.length < 1 ? (
                      <option value="">No active product</option>
                    ) : (
                      availableProducts.map((item) => (
                        <option key={item.folderId} value={item.productName}>
                          {item.productName}
                        </option>
                      ))
                    )}
                  </DropdownSelect>
                </div>
              </div>

              {selectedProduct ? (
                <div className="explore-meta-strip">
                  <div className="explore-meta-chip">
                    <span>Version</span>
                    <strong>{selectedProduct.activeModel.version}</strong>
                  </div>
                  <div className="explore-meta-chip">
                    <span>Model file</span>
                    <strong>{selectedProduct.activeModel.finalModelFileName || selectedProduct.activeModel.fileName}</strong>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="card explore-card">
              <div className="explore-card__header">
                <h3 className="card-title">Target product</h3>
              </div>

              <div className="explore-form-grid explore-form-grid--quad">
                <div className="form-row">
                  <label htmlFor="explore-tv-length">Product length (mm)</label>
                  <input
                    id="explore-tv-length"
                    className="explore-input"
                    type="number"
                    value={fixedInputs.tvLength}
                    onChange={(event) => setFixedInputs((current) => ({ ...current, tvLength: event.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="explore-tv-width">Product width (mm)</label>
                  <input
                    id="explore-tv-width"
                    className="explore-input"
                    type="number"
                    value={fixedInputs.tvWidth}
                    onChange={(event) => setFixedInputs((current) => ({ ...current, tvWidth: event.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="explore-tv-height">Product height (mm)</label>
                  <input
                    id="explore-tv-height"
                    className="explore-input"
                    type="number"
                    value={fixedInputs.tvHeight}
                    onChange={(event) => setFixedInputs((current) => ({ ...current, tvHeight: event.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="explore-product-mass">Product mass (kg)</label>
                  <input
                    id="explore-product-mass"
                    className="explore-input"
                    type="number"
                    min="0"
                    step="0.1"
                    value={fixedInputs.productMass}
                    onChange={(event) => setFixedInputs((current) => ({ ...current, productMass: event.target.value }))}
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="card explore-card">
            <div className="explore-card__header">
              <h3 className="card-title">Parameter range</h3>
            </div>
            <div className="table-scroll">
              <table className="table explore-range-table">
                <thead>
                  <tr>
                    <th>Liner</th>
                    <th>Density min</th>
                    <th>Density max</th>
                    <th>Thickness min</th>
                    <th>Thickness max</th>
                  </tr>
                </thead>
                <tbody>
                  {parameterRanges.map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td>
                        <input
                          className="explore-input explore-input--table"
                          type="number"
                          value={row.densityMin}
                          onChange={(event) => handleRangeChange(row.category, 'densityMin', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="explore-input explore-input--table"
                          type="number"
                          value={row.densityMax}
                          onChange={(event) => handleRangeChange(row.category, 'densityMax', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="explore-input explore-input--table"
                          type="number"
                          value={row.thicknessMin}
                          onChange={(event) => handleRangeChange(row.category, 'thicknessMin', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="explore-input explore-input--table"
                          type="number"
                          value={row.thicknessMax}
                          onChange={(event) => handleRangeChange(row.category, 'thicknessMax', event.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="explore-run-grid">
              <div className="form-row">
                <label htmlFor="explore-threshold">Fragility (g)</label>
                <input id="explore-threshold" className="explore-input" type="number" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
              </div>
              <div className="form-row">
                <label htmlFor="explore-density-step">Density step</label>
                <input id="explore-density-step" className="explore-input" type="number" value={densityStep} onChange={(event) => setDensityStep(event.target.value)} />
              </div>
              <div className="form-row">
                <label htmlFor="explore-thickness-step">Thickness step</label>
                <input id="explore-thickness-step" className="explore-input" type="number" value={thicknessStep} onChange={(event) => setThicknessStep(event.target.value)} />
              </div>
            </div>

            {runError ? <div className="status-note library-cross-validation__error">{runError}</div> : null}

            <div className="explore-action-row">
              <button type="button" className="btn btn--primary" onClick={() => void handleRunReverseDesign()} disabled={isRunning || !selectedProduct}>
                {isRunning ? 'Running reverse design...' : 'Start reverse design'}
              </button>
            </div>
          </section>
        </div>

        <div className="explore-results-grid">
          <section className="card explore-card explore-result-card">
            <div className="explore-card__header">
              <h3 className="card-title">Best solution</h3>
              {result ? <span className="library-status-badge is-ready">Completed</span> : <span className="library-status-badge">Pending</span>}
            </div>

            <section className="explore-result-content">
              {result ? (
                <div className="explore-result-table-stack">
                  <div className="explore-result-table-shell">
                    <div className="explore-result-table-caption">Best feasible scheme</div>
                    {result.bestOverall ? (
                      <div className="table-scroll">
                        <table className="table explore-result-table">
                          <thead>
                            <tr>
                              <th>Material</th>
                              <th>Density (kg/m3)</th>
                              <th>Thickness (mm)</th>
                              <th>Predicted (g)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>{result.bestOverall.category}</td>
                              <td>{formatMetric(result.bestOverall.density, 0)}</td>
                              <td>{formatMetric(result.bestOverall.thickness, 0)}</td>
                              <td>{formatMetric(result.bestOverall.predictedAcceleration, 2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="status-note explore-result-table-empty">No feasible scheme was found under the current threshold and search range.</div>
                    )}
                  </div>

                  <div className="explore-result-table-shell">
                    <div className="explore-result-table-caption">Best solution by material</div>
                    <div className="table-scroll">
                      <table className="table explore-result-table">
                        <thead>
                          <tr>
                            <th>Material</th>
                            <th>Feasible points</th>
                            <th>Density (kg/m3)</th>
                            <th>Thickness (mm)</th>
                            <th>Predicted (g)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bestRows.map((row) => (
                            <tr key={row.category}>
                              <td>{row.category}</td>
                              <td>{formatInteger(row.feasibleCount)}</td>
                              <td>{formatMetric(row.density, 0)}</td>
                              <td>{formatMetric(row.thickness, 0)}</td>
                              <td>{formatMetric(row.predictedAcceleration, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="plot-placeholder explore-overall-card explore-overall-card--empty">
                  Configure product information and parameter ranges, then start reverse design to generate results.
                </div>
              )}
            </section>
          </section>

          <section className="card explore-card explore-result-card explore-results-panel--domain">
            <div className="explore-card__header">
              <h3 className="card-title">Feasible domain plot</h3>
              <button
                type="button"
                className="btn task-action-button explore-card__export"
                onClick={() => void handleExportDomainData()}
                disabled={materialPoints.length < 1 || isExportingDomainData}
              >
                {isExportingDomainData ? 'Exporting...' : 'Export'}
              </button>
            </div>

            <section className="explore-result-content">
              {exportDomainError ? <div className="task-result-panel__error">{exportDomainError}</div> : null}

              <div className="explore-material-tabs" role="tablist" aria-label="Cushioning material">
                {MATERIAL_ORDER.map((category) => {
                  const feasibleCount = result?.bestByCategory.find((row) => row.category === category)?.feasibleCount ?? 0
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`explore-material-tab ${activeMaterial === category ? 'is-active' : ''}`}
                      onClick={() => setActiveMaterial(category)}
                    >
                      <span>{category}</span>
                      <strong>{formatInteger(feasibleCount)}</strong>
                    </button>
                  )
                })}
              </div>

              <ExploreFeasibleDomainChart
                points={materialPoints}
                hoveredPoint={hoveredPoint}
                onHover={setHoveredPoint}
              />

              <div className="explore-hover-card">
                {hoveredPoint ? (
                  <>
                    <div className="explore-hover-card__title">{hoveredPoint.category}</div>
                    <div className="explore-hover-card__grid">
                      <span>Density</span>
                      <strong>{formatMetric(hoveredPoint.density, 0)}</strong>
                      <span>Thickness</span>
                      <strong>{formatMetric(hoveredPoint.thickness, 0)}</strong>
                      <span>Predicted (g)</span>
                      <strong>{formatMetric(hoveredPoint.predictedAcceleration, 2)}</strong>
                      <span>Status</span>
                      <strong>{hoveredPoint.feasible ? 'Feasible' : 'Infeasible'}</strong>
                    </div>
                  </>
                ) : (
                  <div className="status-note">Hover a cell to inspect predicted acceleration and feasibility.</div>
                )}
              </div>
            </section>
          </section>
        </div>
      </section>
    </div>
  )
}
