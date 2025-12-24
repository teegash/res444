"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AgGridReact } from "ag-grid-react"
import type { ColDef } from "ag-grid-community"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"

ModuleRegistry.registerModules([AllCommunityModule])

type Row = {
  tenant_user_id: string
  tenant_name: string | null
  tenant_phone: string | null

  lease_id: string
  building_id: string
  building_name: string
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
      { headerName: "Tenant", field: "tenant_name", flex: 1, minWidth: 180 },
      { headerName: "Phone", field: "tenant_phone", minWidth: 140 },
      { headerName: "Property", field: "building_name", flex: 1, minWidth: 180 },
      { headerName: "Unit", field: "unit_number", minWidth: 110 },
      {
        headerName: "Balance (Arrears)",
        field: "current_balance",
        minWidth: 170,
        valueFormatter: (p) => kes(p.value),
        sortable: true,
        filter: "agNumberColumnFilter",
      },
      {
        headerName: "Open Invoices",
        field: "open_invoices_count",
        minWidth: 150,
        sortable: true,
        filter: "agNumberColumnFilter",
      },
      { headerName: "Last Payment", field: "last_payment_date", minWidth: 140 },
      { headerName: "Oldest Due", field: "oldest_due_date", minWidth: 140 },
      {
        headerName: "Action",
        minWidth: 170,
        cellRenderer: (p: any) => {
          const row = p.data as Row
          return (
            <button
              className="px-3 py-2 rounded-md border bg-white hover:bg-slate-50 text-sm"
              onClick={() => {
                router.push(`/manager/statements/${row.tenant_user_id}?leaseId=${row.lease_id}`)
              }}
            >
              View statement
            </button>
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
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="ag-theme-quartz" style={{ height: 680, width: "100%" }}>
        <AgGridReact<Row>
          ref={gridRef}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: true, sortable: true, filter: true }}
          loading={loading}
          pagination
          paginationPageSize={50}
          onRowDoubleClicked={(e) => {
            const row = e.data as Row
            router.push(`/manager/statements/${row.tenant_user_id}?leaseId=${row.lease_id}`)
          }}
        />
      </div>
    </div>
  )
}
