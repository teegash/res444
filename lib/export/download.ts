'use client'

import type { LetterheadMeta, ResolvedOrganizationBrand } from '@/lib/exports/letterhead'
import { fetchCurrentOrganizationBrand, safeFilename } from '@/lib/exports/letterhead'
import { exportTablePdf } from '@/lib/exports/pdf'
import { exportCsvWithLetterhead } from '@/lib/exports/csv'
import { exportExcelWithLetterhead } from '@/lib/exports/excel'

export type ExportColumn<T> = {
  header: string
  accessor: (row: T) => string | number | null | undefined
  width?: number
  align?: 'left' | 'right' | 'center'
}

type PdfOptions = {
  title?: string
  subtitle?: string
  footerNote?: string
  summaryRows?: Array<Array<string | number>>
  letterhead?: Partial<LetterheadMeta>
  orientation?: 'portrait' | 'landscape' | 'auto'
  tableStyles?: Partial<{
    fontSize: number
    cellPadding: number | { top?: number; right?: number; bottom?: number; left?: number }
    lineHeightFactor: number
    overflow: 'linebreak' | 'ellipsize' | 'visible' | 'hidden'
  }>
}

type ExportMetaOptions = {
  letterhead?: Partial<LetterheadMeta>
}

function normalizeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return value
  }
  return value
}

function stripExtension(filename: string, ext: string) {
  const re = new RegExp(`\\.${ext}$`, 'i')
  return filename.replace(re, '')
}

let cachedOrgBrand: ResolvedOrganizationBrand | null | undefined
let cachedOrgBrandAt = 0
const ORG_CACHE_TTL_MS = 5 * 60 * 1000

async function getOrgBrandCached() {
  const now = Date.now()
  if (cachedOrgBrandAt && now - cachedOrgBrandAt < ORG_CACHE_TTL_MS) return cachedOrgBrand ?? null
  cachedOrgBrandAt = now
  cachedOrgBrand = await fetchCurrentOrganizationBrand()
  return cachedOrgBrand ?? null
}

async function resolveLetterheadMeta(args: {
  filenameBase: string
  title?: string
  letterhead?: Partial<LetterheadMeta>
}): Promise<LetterheadMeta> {
  const nowIso = new Date().toISOString()
  const orgBrand = await getOrgBrandCached()

  const baseTitle = args.title || args.letterhead?.documentTitle || args.filenameBase
  const organizationName =
    args.letterhead?.organizationName || orgBrand?.name || 'RES'

  return {
    organizationName,
    organizationLocation: args.letterhead?.organizationLocation || (orgBrand?.location ?? undefined),
    organizationPhone: args.letterhead?.organizationPhone || (orgBrand?.phone ?? undefined),
    organizationLogoUrl:
      args.letterhead?.organizationLogoUrl !== undefined
        ? args.letterhead.organizationLogoUrl
        : orgBrand?.logo_url ?? null,
    tenantName: args.letterhead?.tenantName,
    tenantPhone: args.letterhead?.tenantPhone,
    propertyName: args.letterhead?.propertyName,
    unitNumber: args.letterhead?.unitNumber,
    documentTitle: args.letterhead?.documentTitle || baseTitle,
    generatedAtISO: args.letterhead?.generatedAtISO || nowIso,
  }
}

export async function exportRowsAsCSV<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[],
  summaryRows?: Array<Array<string | number>>,
  options?: ExportMetaOptions
) {
  const filenameBase = safeFilename(stripExtension(filename, 'csv'))
  const meta = await resolveLetterheadMeta({
    filenameBase,
    title: options?.letterhead?.documentTitle,
    letterhead: options?.letterhead,
  })

  const headers = columns.map((col) => col.header)
  const rows = data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)) as any))

  exportCsvWithLetterhead({
    filenameBase,
    meta,
    headers,
    rows: rows as any,
    summaryRows,
  })
}

export async function exportRowsAsExcel<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[],
  summaryRows?: Array<Array<string | number>>,
  options?: ExportMetaOptions
) {
  const filenameBase = safeFilename(stripExtension(filename, 'xlsx'))
  const meta = await resolveLetterheadMeta({
    filenameBase,
    title: options?.letterhead?.documentTitle,
    letterhead: options?.letterhead,
  })

  const headers = columns.map((col) => col.header)
  const rows = data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)) as any))

  await exportExcelWithLetterhead({
    filenameBase,
    sheetName: 'Report',
    meta,
    headers,
    rows: rows as any,
    summaryRows,
  })
}

export async function exportRowsAsPDF<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[],
  options?: PdfOptions
) {
  const filenameBase = safeFilename(stripExtension(filename, 'pdf'))
  const meta = await resolveLetterheadMeta({
    filenameBase,
    title: options?.title,
    letterhead: options?.letterhead,
  })

  const pdfColumns = columns.map((col) => ({
    header: col.header,
    align: col.align,
  }))

  const body = data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)) as any))

  exportTablePdf({
    filenameBase,
    meta,
    subtitle: options?.subtitle,
    columns: pdfColumns,
    body: body as any,
    summaryRows: options?.summaryRows,
    footerNote: options?.footerNote,
    orientation: options?.orientation,
    tableStyles: options?.tableStyles,
  })
}
