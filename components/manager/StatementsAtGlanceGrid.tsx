"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AgGridReact } from "ag-grid-react"
import type { ColDef } from "ag-grid-community"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF, ExportColumn } from "@/lib/export/download"

ModuleRegistry.registerModules([AllCommunityModule])

type Row = {
  tenant_user_id: string
  tenant_name: string | null
  lease_id: string
  building_id: string | null
  building_name: string | null
  unit_number: string

  current_balance: number
  open_invoices_count: number
  last_payment_date: string | null
  oldest_due_date: string | null
}

function kes(value: unknown) {
  const numberValue = Number(value ?? 0)
  return numberValue.toLocaleString("en-KE", { style: "currency", currency: "KES" })
}

export function StatementsAtGlanceGrid() {
  const router = useRouter()
  const gridRef = useRef<AgGridReact<Row>>(null)

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [buildingId, setBuildingId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [exporting, setExporting] = useState(false)

  const ZOOM_MIN = 0.8
  const ZOOM_MAX = 1.4
  const ZOOM_STEP = 0.1

  async function load(activeQuery: string, activeBuildingId: string) {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (activeQuery) qs.set("q", activeQuery)
      if (activeBuildingId) qs.set("buildingId", activeBuildingId)

      const res = await fetch(`/api/manager/statements?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || "Failed to load statements.")
      }
      setRows(Array.isArray(json.rows) ? json.rows : Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : "Failed to load statements.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load("", "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q.trim(), buildingId), 350)
    return () => clearTimeout(t)
  }, [q, buildingId])

  useEffect(() => {
    if (!gridRef.current) return
    try {
      gridRef.current.api.sizeColumnsToFit()
    } catch {
      // Ignore; grid may not be ready yet.
    }
  }, [zoom])

  const getCurrentViewRows = (): Row[] => {
    const api = gridRef.current?.api
    if (!api) return []
    const exportRows: Row[] = []
    api.forEachNodeAfterFilterAndSort((node) => {
      if (node?.data) exportRows.push(node.data as Row)
    })
    return exportRows
  }

  const exportColumns = useMemo<ExportColumn<Row>[]>(
    () => [
      { header: "Tenant", accessor: (row) => row.tenant_name || "Tenant" },
      { header: "Property", accessor: (row) => row.building_name || "Property" },
      { header: "Unit", accessor: (row) => row.unit_number || "" },
      { header: "Balance (Arrears)", accessor: (row) => kes(row.current_balance), align: "right" },
      { header: "Open Invoices", accessor: (row) => Number(row.open_invoices_count || 0), align: "right" },
      { header: "Last Payment", accessor: (row) => row.last_payment_date || "—" },
      { header: "Oldest Due", accessor: (row) => row.oldest_due_date || "—" },
    ],
    []
  )

  const handleExport = async (format: "pdf" | "excel" | "csv") => {
    if (exporting) return
    const dataToExport = getCurrentViewRows()
    if (dataToExport.length === 0) return

    const now = new Date()
    const dateStamp = now.toISOString().slice(0, 10)
    const generatedAtISO = now.toISOString()
    const fileBase = `statements-at-a-glance-${dateStamp}`
    const subtitleParts: string[] = []
    if (buildingId) subtitleParts.push(`Property filter: ${buildingOptions.find((b) => b.id === buildingId)?.name || buildingId}`)
    if (q.trim()) subtitleParts.push(`Search: "${q.trim()}"`)
    subtitleParts.push(`Rows: ${dataToExport.length}`)

    const totalBalance = dataToExport.reduce((sum, row) => sum + Number(row.current_balance || 0), 0)
    const totalOpen = dataToExport.reduce((sum, row) => sum + Number(row.open_invoices_count || 0), 0)

    const summaryRows: Array<Array<string | number>> = [
      ["", "", "Totals", kes(totalBalance), totalOpen, "", ""],
    ]

    try {
      setExporting(true)
      if (format === "pdf") {
        await exportRowsAsPDF(fileBase, exportColumns, dataToExport, {
          title: "Tenant Statements (At-a-glance)",
          subtitle: subtitleParts.join(" • "),
          footerNote: "Figures reflect the filtered/sorted table view at time of export.",
          summaryRows,
          letterhead: {
            documentTitle: "Tenant Statements (At-a-glance)",
            generatedAtISO,
          },
          orientation: "landscape",
        })
      } else if (format === "excel") {
        await exportRowsAsExcel(fileBase, exportColumns, dataToExport, summaryRows, {
          letterhead: {
            documentTitle: "Tenant Statements (At-a-glance)",
            generatedAtISO,
          },
        })
      } else {
        await exportRowsAsCSV(fileBase, exportColumns, dataToExport, summaryRows, {
          letterhead: {
            documentTitle: "Tenant Statements (At-a-glance)",
            generatedAtISO,
          },
        })
      }
    } finally {
      setExporting(false)
    }
  }

  const buildingOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      if (row.building_id) {
        map.set(row.building_id, row.building_name || "Property")
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [rows])

  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      { headerName: "Tenant", field: "tenant_name", flex: 1, minWidth: 160 },
      { headerName: "Property", field: "building_name", flex: 1, minWidth: 160 },
      { headerName: "Unit", field: "unit_number", minWidth: 90 },
      {
        headerName: "Balance (Arrears)",
        field: "current_balance",
        minWidth: 140,
        valueFormatter: (p) => kes(p.value),
        sortable: true,
        filter: "agNumberColumnFilter",
        cellClass: (p) => (Number(p.value || 0) > 0 ? "text-rose-700 font-semibold" : ""),
      },
      {
        headerName: "Open Invoices",
        field: "open_invoices_count",
        minWidth: 120,
        sortable: true,
        filter: "agNumberColumnFilter",
      },
      { headerName: "Last Payment", field: "last_payment_date", minWidth: 120 },
      { headerName: "Oldest Due", field: "oldest_due_date", minWidth: 120 },
      {
        headerName: "Action",
        minWidth: 110,
        cellRenderer: (p: any) => {
          const row = (p?.data as Row | undefined) || null
          if (!row?.tenant_user_id || !row?.lease_id) {
            return <span className="text-slate-400">—</span>
          }
          const href = `/manager/statements/${row.tenant_user_id}?leaseId=${row.lease_id}`
          return (
            <a
              href={href}
              className="text-[#4169E1] hover:underline font-medium whitespace-nowrap"
              onClick={(e) => {
                e.preventDefault()
                router.push(href)
              }}
            >
              View statement
            </a>
          )
        },
      },
    ],
    [router]
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tenant / property / unit..."
          className="border rounded-md px-3 py-2 w-full max-w-lg bg-white"
        />
        <select
          className="border rounded-md px-3 py-2 bg-white"
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
        >
          <option value="">All properties</option>
          {buildingOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
        <button
          className="border rounded-md px-3 py-2 bg-white"
          onClick={() => load(q.trim(), buildingId)}
        >
          Refresh
        </button>
        <div className="flex items-center border rounded-md bg-white overflow-hidden">
          <button
            type="button"
            className="px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out table"
          >
            −
          </button>
          <div className="px-2 text-xs w-14 text-center select-none tabular-nums">
            {Math.round(zoom * 100)}%
          </div>
          <button
            type="button"
            className="px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in table"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="border rounded-md px-3 py-2 bg-white text-sm hover:bg-slate-50 disabled:opacity-40"
            onClick={() => handleExport("pdf")}
            disabled={loading || exporting}
          >
            PDF
          </button>
          <button
            type="button"
            className="border rounded-md px-3 py-2 bg-white text-sm hover:bg-slate-50 disabled:opacity-40"
            onClick={() => handleExport("excel")}
            disabled={loading || exporting}
          >
            Excel
          </button>
          <button
            type="button"
            className="border rounded-md px-3 py-2 bg-white text-sm hover:bg-slate-50 disabled:opacity-40"
            onClick={() => handleExport("csv")}
            disabled={loading || exporting}
          >
            CSV
          </button>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div
        className="ag-theme-quartz premium-grid glass-grid w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
        style={{ height: 680 }}
      >
        <div
          className="w-full h-full min-w-0"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
          }}
        >
          <AgGridReact<Row>
            theme="legacy"
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={{ resizable: true, sortable: true, filter: true }}
            loading={loading}
            pagination
            paginationPageSize={50}
            onGridReady={(e) => {
              e.api.sizeColumnsToFit()
            }}
            onFirstDataRendered={(e) => {
              e.api.sizeColumnsToFit()
            }}
            onRowDoubleClicked={(e) => {
              const row = (e?.data as Row | undefined) || null
              if (!row?.tenant_user_id || !row?.lease_id) return
              router.push(`/manager/statements/${row.tenant_user_id}?leaseId=${row.lease_id}`)
            }}
          />
        </div>
      </div>
    </div>
  )
}
