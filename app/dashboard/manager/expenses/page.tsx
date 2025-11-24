'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Download, Wallet, CheckCircle2 } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'
import { useToast } from '@/components/ui/use-toast'

type Expense = {
  id: string
  amount: number
  incurred_at: string | null
  category: string
  notes?: string | null
  property_id: string
  apartment_buildings?: { id: string; name: string | null; location: string | null } | null
}

type PropertyOption = { id: string; name: string | null }

const categories = ['maintenance', 'utilities', 'taxes', 'staff', 'insurance', 'marketing', 'other']

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingRecurring, setSavingRecurring] = useState(false)
  const { toast } = useToast()
  const [lastSavedMessage, setLastSavedMessage] = useState<string | null>(null)

  const [newExpense, setNewExpense] = useState({
    property_id: '',
    amount: '',
    category: '',
    incurred_at: '',
    notes: '',
    recurring: false,
  })

  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase()
    const scoped =
      propertyFilter === 'all'
        ? expenses
        : expenses.filter((exp) => exp.property_id === propertyFilter)
    if (!term) return scoped
    return scoped.filter((exp) => {
      const name = exp.apartment_buildings?.name || ''
      return `${name} ${exp.category} ${exp.notes || ''}`.toLowerCase().includes(term)
    })
  }, [expenses, propertyFilter, search])

  const loadExpenses = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/manager/expenses${propertyFilter && propertyFilter !== 'all' ? `?propertyId=${propertyFilter}` : ''}`,
        { cache: 'no-store' }
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load expenses.')
      setExpenses(Array.isArray(payload.data) ? payload.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load expenses.')
    } finally {
      setLoading(false)
    }
  }

  const loadProperties = async () => {
    const response = await fetch('/api/properties', { cache: 'no-store' })
    const payload = await response.json()
    if (response.ok) {
      setProperties((payload.data || []).map((p: any) => ({ id: p.id, name: p.name || 'Property' })))
    }
  }

  useEffect(() => {
    loadProperties()
  }, [])

  useEffect(() => {
    loadExpenses()
  }, [propertyFilter])

  const handleSave = async () => {
    if (!newExpense.property_id || !newExpense.amount || !newExpense.category) return
    try {
      setSaving(true)
      const response = await fetch('/api/manager/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpense),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to save expense.')
      setNewExpense({ property_id: '', amount: '', category: '', incurred_at: '', notes: '', recurring: false })
      loadExpenses()
      setLastSavedMessage('Expense added successfully.')
      toast({ title: 'Expense added', description: 'Your expense has been saved and will reflect in statements.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save expense.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRecurring = async () => {
    if (!newExpense.property_id || !newExpense.amount || !newExpense.category) return
    try {
      setSavingRecurring(true)
      const response = await fetch('/api/manager/expenses/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: newExpense.property_id,
          amount: newExpense.amount,
          category: newExpense.category,
          incurred_at: newExpense.incurred_at,
          notes: newExpense.notes,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to save recurring expense.')
      setNewExpense({ property_id: '', amount: '', category: '', incurred_at: '', notes: '', recurring: false })
      setLastSavedMessage('Recurring expense scheduled for the 1st of each month.')
      toast({ title: 'Recurring expense created', description: 'Auto-deduction will run on the 1st monthly.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save recurring expense.')
    } finally {
      setSavingRecurring(false)
    }
  }

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `expenses-${propertyFilter}-${new Date().toISOString().slice(0, 10)}`
    const columns = [
      { header: 'Property', accessor: (row: Expense) => row.apartment_buildings?.name || 'Property' },
      { header: 'Category', accessor: (row: Expense) => row.category },
      { header: 'Amount', accessor: (row: Expense) => `KES ${Number(row.amount || 0).toLocaleString()}` },
      { header: 'Date', accessor: (row: Expense) => (row.incurred_at ? new Date(row.incurred_at).toLocaleDateString() : '') },
      { header: 'Notes', accessor: (row: Expense) => row.notes || '' },
    ]
    const total = filteredExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const summaryRows = [['Total', '', `KES ${total.toLocaleString()}`, '', '']]
    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, filteredExpenses, {
        title: 'Expenses',
        subtitle: `Property: ${propertyFilter}`,
        summaryRows,
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, filteredExpenses, summaryRows)
    } else {
      exportRowsAsCSV(filename, columns, filteredExpenses, summaryRows)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/manager/reports">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">Expenses</h1>
                <p className="text-sm text-muted-foreground">Track property and unit expenses.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All properties</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => handleExport('pdf')} className="gap-2">
                <Download className="h-4 w-4" /> PDF
              </Button>
              <Button variant="outline" onClick={() => handleExport('excel')} className="gap-2">
                <Download className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={() => handleExport('csv')} className="gap-2">
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-0 shadow-lg bg-white">
              <CardHeader>
            <CardTitle>Expenses</CardTitle>
            <CardDescription>Recent recorded expenses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <SkeletonTable rows={6} columns={4} />
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : filteredExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses found.</p>
            ) : (
                  filteredExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="p-4 rounded-lg border bg-gradient-to-r from-slate-50 to-white flex items-start gap-4"
                    >
                      <div className="p-2 rounded-full bg-amber-100">
                        <Wallet className="h-4 w-4 text-amber-700" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">
                              {expense.apartment_buildings?.name || 'Property'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {expense.apartment_buildings?.location || ''}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-red-600">
                            KES {Number(expense.amount || 0).toLocaleString()}
                          </p>
                        </div>
                        <p className="text-xs uppercase text-muted-foreground mt-1">
                          {expense.category}
                        </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>
                            {expense.incurred_at
                              ? new Date(expense.incurred_at).toLocaleDateString()
                              : ''}
                          </span>
                          <span>{expense.notes || ''}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white">
              <CardHeader>
                <CardTitle>Add expense</CardTitle>
                <CardDescription>Capture recurring or ad-hoc property costs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select
                    value={newExpense.property_id}
                    onValueChange={(value) => setNewExpense((prev) => ({ ...prev, property_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense((prev) => ({ ...prev, amount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={newExpense.category}
                      onValueChange={(value) => setNewExpense((prev) => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={newExpense.incurred_at}
                    onChange={(e) => setNewExpense((prev) => ({ ...prev, incurred_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={3}
                    value={newExpense.notes}
                    onChange={(e) => setNewExpense((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Save once
                      </>
                    )}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleSaveRecurring} disabled={savingRecurring}>
                    {savingRecurring ? 'Scheduling…' : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Save & repeat monthly
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {lastSavedMessage && (
              <Card className="lg:col-span-3 border-green-200 bg-green-50">
                <CardContent className="flex items-center gap-3 py-3 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-medium">{lastSavedMessage}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
