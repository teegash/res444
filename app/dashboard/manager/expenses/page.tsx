'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Download, Wallet, Pencil, Trash2, RefreshCw } from 'lucide-react'
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
import { SuccessStateCard } from '@/components/ui/success-state-card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'

type Expense = {
  id: string
  amount: number
  incurred_at: string | null
  created_at?: string | null
  category: string
  notes?: string | null
  property_id: string
  maintenance_request_id?: string | null
  apartment_buildings?: { id: string; name: string | null; location: string | null } | null
}

type EditingExpense = {
  id: string
  property_id: string
  amount: number
  category: string
  incurred_at: string | null
  notes_input: string
  recurring_marker: string | null
}

type PropertyOption = { id: string; name: string | null }
type RecurringExpense = {
  id: string
  property_id: string
  category: string
  amount: number
  notes: string | null
  next_run: string
  active: boolean
  apartment_buildings?: { id: string; name: string | null; location: string | null } | null
}

const categories = ['maintenance', 'utilities', 'taxes', 'staff', 'insurance', 'marketing', 'other']
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('this_month')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successState, setSuccessState] = useState<{
    title: string
    description?: string
    badge?: string
    details?: { label: string; value: string }[]
  } | null>(null)
  const [savingRecurring, setSavingRecurring] = useState(false)
  const { toast } = useToast()
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
  const [recurringLoading, setRecurringLoading] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null)
  const [editRecurringSaving, setEditRecurringSaving] = useState(false)
  const [deleteRecurring, setDeleteRecurring] = useState<RecurringExpense | null>(null)
  const [editingExpense, setEditingExpense] = useState<EditingExpense | null>(null)
  const [editExpenseSaving, setEditExpenseSaving] = useState(false)
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null)
  const searchParams = useSearchParams()

  const [newExpense, setNewExpense] = useState({
    property_id: '',
    amount: '',
    category: '',
    incurred_at: '',
    notes: '',
    recurring: false,
  })

  const resolvePeriodRange = (period: string) => {
    const now = new Date()
    const end = now.toISOString().slice(0, 10)

    if (period === 'all') {
      return { start: null, end }
    }

    if (period === 'this_month') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      return { start: start.toISOString().slice(0, 10), end }
    }

    if (period === 'last_3_months') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      start.setUTCMonth(start.getUTCMonth() - 3)
      return { start: start.toISOString().slice(0, 10), end }
    }

    if (period === 'last_6_months') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      start.setUTCMonth(start.getUTCMonth() - 6)
      return { start: start.toISOString().slice(0, 10), end }
    }

    if (period === 'last_year') {
      const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1))
      return { start: start.toISOString().slice(0, 10), end }
    }

    return { start: null, end }
  }

  const periodLabel = (period: string) => {
    switch (period) {
      case 'this_month':
        return 'This month'
      case 'last_3_months':
        return 'Last 3 months'
      case 'last_6_months':
        return 'Last 6 months'
      case 'last_year':
        return 'Last year'
      default:
        return 'All time'
    }
  }

  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase()
    const { start, end } = resolvePeriodRange(periodFilter)
    const scoped =
      propertyFilter === 'all'
        ? expenses
        : expenses.filter((exp) => exp.property_id === propertyFilter)
    const rangeFiltered = scoped.filter((exp) => {
      if (!start) return true
      const dateIso = (exp.incurred_at || exp.created_at || '').slice(0, 10)
      if (!dateIso) return false
      if (start && dateIso < start) return false
      return dateIso <= end
    })
    if (!term) return rangeFiltered
    return rangeFiltered.filter((exp) => {
      const name = exp.apartment_buildings?.name || ''
      return `${name} ${exp.category} ${exp.notes || ''}`.toLowerCase().includes(term)
    })
  }, [expenses, periodFilter, propertyFilter, search])

  const filteredOneTimeExpenses = useMemo(() => {
    return filteredExpenses.filter((exp) => !recurringMarkerFromNotes(exp.notes))
  }, [filteredExpenses])

  const loadExpenses = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (propertyFilter && propertyFilter !== 'all') {
        params.set('propertyId', propertyFilter)
      }
      if (sourceFilter === 'maintenance') {
        params.set('source', 'maintenance')
      }
      const queryString = params.toString()
      const response = await fetch(
        `/api/manager/expenses${queryString ? `?${queryString}` : ''}`,
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
    const source = searchParams?.get('source')
    if (source === 'maintenance') {
      setSourceFilter('maintenance')
    }
  }, [searchParams])

  useEffect(() => {
    loadExpenses()
  }, [propertyFilter, sourceFilter])

  const loadRecurring = async () => {
    try {
      setRecurringLoading(true)
      const response = await fetch('/api/manager/expenses/recurring', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load recurring expenses.')
      setRecurring(Array.isArray(payload.data) ? payload.data : [])
    } catch (err) {
      console.error('[RecurringExpenses] load failed', err)
    } finally {
      setRecurringLoading(false)
    }
  }

  useEffect(() => {
    loadRecurring()
  }, [])

  const handleSave = async () => {
    if (!newExpense.property_id || !newExpense.amount || !newExpense.category) return
    try {
      setSaving(true)
      setError(null)
      setSuccessState(null)
      const propertyLabel =
        properties.find((property) => property.id === newExpense.property_id)?.name || 'Property'
      const amountLabel = `KES ${Number(newExpense.amount || 0).toLocaleString()}`

      const response = await fetch('/api/manager/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpense),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to save expense.')
      setNewExpense({ property_id: '', amount: '', category: '', incurred_at: '', notes: '', recurring: false })
      await loadExpenses()
      setSuccessState({
        title: 'Expense saved',
        description: 'The expense is now reflected in your statements.',
        badge: 'Expense added',
        details: [
          { label: 'Property', value: propertyLabel },
          { label: 'Category', value: newExpense.category },
          { label: 'Amount', value: amountLabel },
        ],
      })
      toast({ title: 'Expense added', description: 'Your expense has been saved and will reflect in statements.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save expense.'
      setError(message)
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRecurring = async () => {
    if (!newExpense.property_id || !newExpense.amount || !newExpense.category) return
    try {
      setSavingRecurring(true)
      setError(null)
      setSuccessState(null)
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
      setSuccessState({
        title: 'Recurring expense scheduled',
        description: 'Auto-deduction will run on the 1st of each month.',
        badge: 'Recurring saved',
        details: [
          {
            label: 'Property',
            value: properties.find((property) => property.id === newExpense.property_id)?.name || 'Property',
          },
          { label: 'Category', value: newExpense.category },
          { label: 'Amount', value: `KES ${Number(newExpense.amount || 0).toLocaleString()}` },
        ],
      })
      toast({ title: 'Recurring expense created', description: 'Auto-deduction will run on the 1st monthly.' })
      await loadRecurring()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save recurring expense.'
      setError(message)
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally {
      setSavingRecurring(false)
    }
  }

  const handleUpdateRecurring = async () => {
    if (!editingRecurring) return
    if (!editingRecurring.id || !isUuid(editingRecurring.id)) {
      toast({ title: 'Invalid recurring expense id', variant: 'destructive' })
      return
    }
    try {
      setEditRecurringSaving(true)
      setSuccessState(null)
      const response = await fetch(`/api/manager/expenses/recurring/${editingRecurring.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: editingRecurring.property_id,
          amount: editingRecurring.amount,
          category: editingRecurring.category,
          notes: editingRecurring.notes,
          active: editingRecurring.active,
          // treat as start month hint; server enforces 1st of month
          incurred_at: editingRecurring.next_run,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Failed to update recurring expense.')
      toast({ title: 'Recurring expense updated' })
      setSuccessState({
        title: 'Recurring expense updated',
        description: 'Changes saved for the next run.',
        badge: 'Update saved',
        details: [
          {
            label: 'Property',
            value: properties.find((property) => property.id === editingRecurring.property_id)?.name || 'Property',
          },
          { label: 'Category', value: editingRecurring.category },
          { label: 'Amount', value: `KES ${Number(editingRecurring.amount || 0).toLocaleString()}` },
        ],
      })
      setEditingRecurring(null)
      loadRecurring()
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update recurring expense.',
        variant: 'destructive',
      })
    } finally {
      setEditRecurringSaving(false)
    }
  }

  const handleDeleteRecurring = async (recurringId?: string) => {
    const id = recurringId || deleteRecurring?.id
    if (!id || !isUuid(id)) {
      toast({ title: 'Invalid recurring expense id', variant: 'destructive' })
      return
    }
    try {
      setSuccessState(null)
      const response = await fetch(`/api/manager/expenses/recurring/${id}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Failed to delete recurring expense.')
      toast({ title: 'Recurring expense deleted' })
      setSuccessState({
        title: 'Recurring expense deleted',
        description: 'The recurring item has been removed.',
        badge: 'Deleted',
        details: [
          {
            label: 'Property',
            value: properties.find((property) => property.id === deleteRecurring?.property_id)?.name || 'Property',
          },
          { label: 'Category', value: deleteRecurring?.category || '—' },
          { label: 'Amount', value: `KES ${Number(deleteRecurring?.amount || 0).toLocaleString()}` },
        ],
      })
      setDeleteRecurring(null)
      loadRecurring()
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete recurring expense.',
        variant: 'destructive',
      })
    }
  }

  const formatNextRun = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  function recurringMarkerFromNotes(notes: string | null | undefined) {
    const raw = String(notes || '')
    const match = raw.match(/\[recurring:[^\]]+\]/)
    return match ? match[0] : null
  }

  function stripRecurringMarker(notes: string | null | undefined) {
    return String(notes || '').replace(/\s*\[recurring:[^\]]+\]\s*/g, ' ').trim()
  }

  const toDateInputValue = (iso: string | null | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  }

  const openEditExpense = (expense: Expense) => {
    if (!expense?.id || !isUuid(String(expense.id))) {
      toast({ title: 'Invalid expense id', description: 'Reload the page and try again.', variant: 'destructive' })
      return
    }
    setEditingExpense({
      id: expense.id,
      property_id: expense.property_id,
      amount: Number(expense.amount || 0),
      category: expense.category,
      incurred_at: expense.incurred_at,
      notes_input: stripRecurringMarker(expense.notes),
      recurring_marker: recurringMarkerFromNotes(expense.notes),
    })
  }

  const handleUpdateExpense = async () => {
    if (!editingExpense) return
    if (!editingExpense.id || !isUuid(editingExpense.id)) {
      toast({ title: 'Invalid expense id', description: 'Reload the page and try again.', variant: 'destructive' })
      return
    }
    if (!editingExpense.property_id || !editingExpense.category) {
      toast({
        title: 'Missing fields',
        description: 'Property and category are required.',
        variant: 'destructive',
      })
      return
    }
    if (!Number.isFinite(Number(editingExpense.amount)) || Number(editingExpense.amount) <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Amount must be a positive number.',
        variant: 'destructive',
      })
      return
    }

    try {
      setEditExpenseSaving(true)
      setSuccessState(null)

      const combinedNotes = (() => {
        const clean = String(editingExpense.notes_input || '').trim()
        if (!editingExpense.recurring_marker) return clean || null
        return `${clean || 'Recurring expense'} ${editingExpense.recurring_marker}`.trim()
      })()

      const response = await fetch(`/api/manager/expenses/${editingExpense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: editingExpense.property_id,
          amount: Number(editingExpense.amount || 0),
          category: editingExpense.category,
          incurred_at: editingExpense.incurred_at,
          notes: combinedNotes,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Failed to update expense.')

      toast({ title: 'Expense updated', description: 'Changes saved successfully.' })
      setSuccessState({
        title: 'Expense updated',
        description: 'Changes saved successfully.',
        badge: 'Update saved',
        details: [
          {
            label: 'Property',
            value: properties.find((property) => property.id === editingExpense.property_id)?.name || 'Property',
          },
          { label: 'Category', value: editingExpense.category },
          { label: 'Amount', value: `KES ${Number(editingExpense.amount || 0).toLocaleString()}` },
        ],
      })
      setEditingExpense(null)
      await loadExpenses()
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update expense.',
        variant: 'destructive',
      })
    } finally {
      setEditExpenseSaving(false)
    }
  }

  const handleDeleteExpense = async (expenseId?: string) => {
    const id = expenseId || deleteExpense?.id
    if (!id || !isUuid(id)) {
      toast({ title: 'Invalid expense id', variant: 'destructive' })
      return
    }
    try {
      setSuccessState(null)
      const response = await fetch(`/api/manager/expenses/${id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Failed to delete expense.')
      toast({ title: 'Expense deleted' })
      setSuccessState({
        title: 'Expense deleted',
        description: 'The expense has been removed.',
        badge: 'Deleted',
        details: [
          {
            label: 'Property',
            value: properties.find((property) => property.id === deleteExpense?.property_id)?.name || 'Property',
          },
          { label: 'Category', value: deleteExpense?.category || '—' },
          { label: 'Amount', value: `KES ${Number(deleteExpense?.amount || 0).toLocaleString()}` },
        ],
      })
      setDeleteExpense(null)
      await loadExpenses()
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete expense.',
        variant: 'destructive',
      })
    }
  }

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `expenses-${propertyFilter}-${sourceFilter}-${new Date().toISOString().slice(0, 10)}`
    const generatedAtISO = new Date().toISOString()
    const letterhead = { documentTitle: 'Expenses', generatedAtISO }
    const columns = [
      { header: 'Property', accessor: (row: Expense) => row.apartment_buildings?.name || 'Property' },
      { header: 'Category', accessor: (row: Expense) => row.category },
      { header: 'Debit (KES)', accessor: (row: Expense) => `KES ${Number(row.amount || 0).toLocaleString()}` },
      { header: 'Credit (KES)', accessor: () => '' },
      { header: 'Date', accessor: (row: Expense) => (row.incurred_at ? new Date(row.incurred_at).toLocaleDateString() : '') },
      { header: 'Notes', accessor: (row: Expense) => stripRecurringMarker(row.notes) },
    ]
    const total = filteredOneTimeExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const summaryRows = [['Total', '', `KES ${total.toLocaleString()}`, '', '', '']]
    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, filteredOneTimeExpenses, {
        title: 'Expenses',
        subtitle: `Property: ${propertyFilter} · Source: ${sourceFilter} · Period: ${periodLabel(periodFilter)}`,
        summaryRows,
        letterhead,
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, filteredOneTimeExpenses, summaryRows, { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, filteredOneTimeExpenses, summaryRows, { letterhead })
    }
  }

  return (
    <>
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {successState ? (
            <SuccessStateCard
              title={successState.title}
              description={successState.description}
              badge={successState.badge}
              details={successState.details}
              onBack={() => setSuccessState(null)}
              actions={
                <>
                  <Button onClick={() => setSuccessState(null)}>Back to expenses</Button>
                  <Button variant="outline" onClick={() => setSuccessState(null)}>
                    Continue
                  </Button>
                </>
              }
            />
          ) : (
            <>
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
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This month</SelectItem>
                  <SelectItem value="last_3_months">Last 3 months</SelectItem>
                  <SelectItem value="last_6_months">Last 6 months</SelectItem>
                  <SelectItem value="last_year">Last year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
              {sourceFilter === 'maintenance' && (
                <Badge className="bg-emerald-100 text-emerald-700">Maintenance</Badge>
              )}
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
	            <CardTitle>One-time expenses</CardTitle>
	            <CardDescription>Manual expenses only (recurring schedules are listed below).</CardDescription>
	          </CardHeader>
	          <CardContent className="space-y-3">
	            {loading ? (
	              <SkeletonTable rows={6} columns={4} />
	            ) : error ? (
	              <p className="text-sm text-red-600">{error}</p>
	            ) : filteredOneTimeExpenses.length === 0 ? (
	              <p className="text-sm text-muted-foreground">No expenses found.</p>
	            ) : (
                  <div className="max-h-[560px] overflow-y-auto pr-2 space-y-3">
		                  {filteredOneTimeExpenses.map((expense) => (
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
	                          <div className="flex items-center gap-2">
	                            <p className="text-sm font-semibold text-red-600">
	                              KES {Number(expense.amount || 0).toLocaleString()}
	                            </p>
	                            <Button
	                              variant="outline"
	                              size="icon"
	                              className="h-8 w-8"
	                              onClick={() => openEditExpense(expense)}
	                              aria-label="Edit expense"
	                            >
	                              <Pencil className="h-4 w-4" />
	                            </Button>
	                            <Button
	                              variant="destructive"
	                              size="icon"
	                              className="h-8 w-8"
	                              onClick={() => setDeleteExpense(expense)}
	                              aria-label="Delete expense"
	                            >
	                              <Trash2 className="h-4 w-4" />
	                            </Button>
	                          </div>
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
	                          <span>{stripRecurringMarker(expense.notes)}</span>
	                        </div>
		                      </div>
		                    </div>
		                  ))}
                  </div>
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

          </div>

          <Card className="border-0 shadow-lg bg-white">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Recurring expenses</CardTitle>
                <CardDescription>
                  Debited automatically on the 1st of the month (00:00 UTC) and reflected in financial reports.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={loadRecurring} disabled={recurringLoading}>
                <RefreshCw className={`h-4 w-4 ${recurringLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {recurringLoading ? (
                <SkeletonTable rows={4} columns={5} />
              ) : recurring.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recurring expenses configured yet.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <div className="min-w-[980px] grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.6fr)] gap-2 bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
                    <div>Property</div>
                    <div>Category</div>
                    <div>Notes</div>
                    <div>Amount</div>
                    <div>Next run</div>
                    <div className="text-right">Actions</div>
                  </div>
                  <div className="divide-y">
                    {recurring.map((r) => (
                      <div
                        key={r.id}
                        className="min-w-[980px] grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.6fr)] gap-2 px-4 py-3 items-center"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">
                            {r.apartment_buildings?.name || 'Property'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.apartment_buildings?.location || ''}
                          </div>
                        </div>
                        <div className="text-sm capitalize">{r.category}</div>
                        <div className="min-w-0 text-sm text-muted-foreground truncate" title={r.notes || ''}>
                          {r.notes || '—'}
                        </div>
                        <div className="text-sm font-semibold text-red-600">
                          KES {Number(r.amount || 0).toLocaleString()}
                        </div>
                        <div className="text-sm">
                          <div>{formatNextRun(r.next_run)}</div>
                          <div className="mt-1">
                            {r.active ? (
                              <Badge className="bg-emerald-600 text-white">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingRecurring(r)}
                            className="gap-2"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteRecurring(r)}
                            className="gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
            </>
          )}
        </main>
      </div>
    </div>

    <Dialog open={!!editingRecurring} onOpenChange={(open) => (!open ? setEditingRecurring(null) : null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit recurring expense</DialogTitle>
          <DialogDescription>
            Recurring expenses run on the 1st of the month (00:00 UTC). Editing updates future runs.
          </DialogDescription>
        </DialogHeader>
        {editingRecurring ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select
                value={editingRecurring.property_id}
                onValueChange={(value) =>
                  setEditingRecurring((prev) => (prev ? { ...prev, property_id: value } : prev))
                }
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
                  value={String(editingRecurring.amount ?? '')}
                  onChange={(e) =>
                    setEditingRecurring((prev) =>
                      prev ? { ...prev, amount: Number(e.target.value || 0) } : prev
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editingRecurring.category}
                  onValueChange={(value) =>
                    setEditingRecurring((prev) => (prev ? { ...prev, category: value } : prev))
                  }
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
              <Label>Start month (optional)</Label>
              <Input
                type="month"
                value={editingRecurring.next_run ? String(editingRecurring.next_run).slice(0, 7) : ''}
                onChange={(e) => {
                  const ym = e.target.value // YYYY-MM
                  if (!ym) return
                  setEditingRecurring((prev) =>
                    prev ? { ...prev, next_run: `${ym}-01T00:00:00.000Z` } : prev
                  )
                }}
              />
              <p className="text-xs text-muted-foreground">
                Runs at midnight (UTC) on the 1st of the selected month (or the next month if the month is already in progress).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={editingRecurring.notes || ''}
                onChange={(e) =>
                  setEditingRecurring((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive schedules will not be executed.</p>
              </div>
              <input
                type="checkbox"
                checked={editingRecurring.active}
                onChange={(e) =>
                  setEditingRecurring((prev) => (prev ? { ...prev, active: e.target.checked } : prev))
                }
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingRecurring(null)}>
            Cancel
          </Button>
          <Button onClick={handleUpdateRecurring} disabled={editRecurringSaving}>
            {editRecurringSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

	    <AlertDialog open={!!deleteRecurring} onOpenChange={(open) => (!open ? setDeleteRecurring(null) : null)}>
	      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete recurring expense?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops future monthly debits for this recurring expense. Past expenses already recorded will remain in statements.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => handleDeleteRecurring(deleteRecurring?.id)}>Delete</AlertDialogAction>
	        </AlertDialogFooter>
	      </AlertDialogContent>
	    </AlertDialog>

      <Dialog open={!!editingExpense} onOpenChange={(open) => (!open ? setEditingExpense(null) : null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit expense</DialogTitle>
            <DialogDescription>Update the amount, date, category, or notes.</DialogDescription>
          </DialogHeader>
          {editingExpense ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Property</Label>
                <Select
                  value={editingExpense.property_id}
                  onValueChange={(value) =>
                    setEditingExpense((prev) => (prev ? { ...prev, property_id: value } : prev))
                  }
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
                    value={String(editingExpense.amount ?? '')}
                    onChange={(e) =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, amount: Number(e.target.value || 0) } : prev
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={editingExpense.category}
                    onValueChange={(value) =>
                      setEditingExpense((prev) => (prev ? { ...prev, category: value } : prev))
                    }
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
                  value={toDateInputValue(editingExpense.incurred_at)}
                  onChange={(e) =>
                    setEditingExpense((prev) =>
                      prev ? { ...prev, incurred_at: e.target.value ? `${e.target.value}T00:00:00.000Z` : null } : prev
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={editingExpense.notes_input}
                  onChange={(e) =>
                    setEditingExpense((prev) => (prev ? { ...prev, notes_input: e.target.value } : prev))
                  }
                />
                {editingExpense.recurring_marker ? (
                  <p className="text-xs text-muted-foreground">
                    This was auto-created from a recurring schedule. The schedule link will be preserved.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingExpense(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateExpense} disabled={editExpenseSaving}>
              {editExpenseSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteExpense} onOpenChange={(open) => (!open ? setDeleteExpense(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the expense from the ledger and financial statements for your organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDeleteExpense(deleteExpense?.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
	    </>
	  )
}
