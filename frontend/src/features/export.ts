type ExportColumn<Row> = {
  label: string
  value: (row: Row) => string | number | boolean | null | undefined
}

type ExportWorkbookOptions<Row> = {
  fileName: string
  sheetName?: string
  columns: ExportColumn<Row>[]
  rows: Row[]
}

const INVALID_FILE_NAME_PATTERN = /[<>:"/\\|?*\x00-\x1f]/g
const INVALID_SHEET_NAME_PATTERN = /[:\\/?*\[\]]/g

const sanitizeFileNameSegment = (value: string, fallback: string) => {
  const sanitized = String(value ?? '')
    .trim()
    .replace(INVALID_FILE_NAME_PATTERN, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')

  return sanitized || fallback
}

const ensureWorkbookFileName = (value: string) => {
  const sanitized = sanitizeFileNameSegment(value, 'Export')
  return sanitized.toLowerCase().endsWith('.xlsx') ? sanitized : `${sanitized}.xlsx`
}

const sanitizeSheetName = (value: string) => {
  const sanitized = String(value ?? '')
    .trim()
    .replace(INVALID_SHEET_NAME_PATTERN, '_')

  return (sanitized || 'Sheet1').slice(0, 31)
}

const measureCellWidth = (value: unknown) => {
  if (value == null) {
    return 0
  }
  return String(value).length
}

export const exportRowsToWorkbook = async <Row>({
  fileName,
  sheetName = 'Sheet1',
  columns,
  rows,
}: ExportWorkbookOptions<Row>) => {
  if (columns.length < 1) {
    throw new Error('Export columns are required.')
  }
  if (rows.length < 1) {
    throw new Error('There is no data to export.')
  }

  const XLSX = await import('xlsx')
  const headerRow = columns.map((column) => column.label)
  const bodyRows = rows.map((row) => columns.map((column) => column.value(row) ?? ''))
  const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...bodyRows])

  worksheet['!cols'] = columns.map((column, columnIndex) => ({
    wch: Math.min(
      42,
      Math.max(
        measureCellWidth(column.label) + 2,
        ...bodyRows.map((row) => measureCellWidth(row[columnIndex]) + 2),
      ),
    ),
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheetName))
  XLSX.writeFile(workbook, ensureWorkbookFileName(fileName))
}

export const buildExportFileName = (value: string, fallback: string) =>
  ensureWorkbookFileName(sanitizeFileNameSegment(value, fallback))
