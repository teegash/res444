'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'
import { ArrowLeft, Plus, Pencil, Trash2, X, RefreshCw } from 'lucide-react'

type Profession = {
  id: string
  name: string
}

type Technician = {
  id: string | null
  full_name: string
  phone: string | null
  email: string | null
  company: string | null
  is_active: boolean
  notes?: string | null
  professions?: Profession[]
}

type TechnicianFormState = {
  full_name: string
  phone: string
  email: string
  company: string
  is_active: boolean
  notes: string
  profession_ids: string[]
}

const emptyForm: TechnicianFormState = {
  full_name: '',
  phone: '',
  email: '',
  company: '',
  is_active: true,
  notes: '',
  profession_ids: [],
}

export default function TechniciansPage() {
  const { toast } = useToast()
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [professions, setProfessions] = useState<Profession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Technician | null>(null)
  const [form, setForm] = useState<TechnicianFormState>(emptyForm)
  const [searchTerm, setSearchTerm] = useState('')
  const [professionFilter, setProfessionFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<Technician | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadProfessions = useCallback(async () => {
    const response = await fetch('/api/technician-professions', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load professions.')
    }
    setProfessions(payload.data || [])
  }, [])

  const loadTechnicians = useCallback(async () => {
    const response = await fetch('/api/technicians', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load technicians.')
    }
    setTechnicians(payload.data || [])
  }, [])

  useEffect(() => {
    let isMounted = true
    const loadAll = async () => {
      try {
        setLoading(true)
        setError(null)
        await Promise.all([loadProfessions(), loadTechnicians()])
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load technicians.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadAll()
    return () => {
      isMounted = false
    }
  }, [loadProfessions, loadTechnicians])

  const resetForm = useCallback(() => {
    setForm(emptyForm)
    setEditing(null)
  }, [])

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true)
      setError(null)
      await Promise.all([loadProfessions(), loadTechnicians()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh technicians.')
    } finally {
      setRefreshing(false)
    }
  }, [loadProfessions, loadTechnicians])

  const openCreate = () => {
    resetForm()
    setModalOpen(true)
  }

  const openEdit = (technician: Technician) => {
    if (!technician.id) {
      toast({
        title: 'Technician unavailable',
        description: 'This record is missing an ID. Refresh and try again.',
        variant: 'destructive',
      })
      return
    }
    setEditing(technician)
    setForm({
      full_name: technician.full_name || '',
      phone: technician.phone || '',
      email: technician.email || '',
      company: technician.company || '',
      is_active: Boolean(technician.is_active),
      notes: technician.notes || '',
      profession_ids: (technician.professions || []).map((profession) => profession.id),
    })
    setModalOpen(true)
  }

  const toggleProfession = (professionId: string) => {
    setForm((prev) => {
      const next = new Set(prev.profession_ids)
      if (next.has(professionId)) {
        next.delete(professionId)
      } else {
        next.add(professionId)
      }
      return { ...prev, profession_ids: Array.from(next) }
    })
  }

  const handleSave = async () => {
    const fullName = form.full_name.trim()
    if (!fullName) {
      toast({
        title: 'Full name required',
        description: 'Enter the technician name before saving.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const payload = {
        full_name: fullName,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        company: form.company.trim() || null,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
        profession_ids: form.profession_ids,
      }

      const response = await fetch(
        editing ? `/api/technicians/${editing.id}` : '/api/technicians',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save technician.')
      }

      toast({
        title: editing ? 'Technician updated' : 'Technician added',
        description: `${fullName} is now available for assignments.`,
      })
      setModalOpen(false)
      resetForm()
      await loadTechnicians()
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to save technician.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (technician: Technician) => {
    if (!technician.id) {
      toast({
        title: 'Technician unavailable',
        description: 'This record is missing an ID. Refresh and try again.',
        variant: 'destructive',
      })
      return
    }
    setDeleteTarget(technician)
    setDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/technicians/${deleteTarget.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete technician.')
      }
      toast({
        title: 'Technician removed',
        description: `${deleteTarget.full_name} has been removed.`,
      })
      await loadTechnicians()
      setDeleteOpen(false)
      setDeleteTarget(null)
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete technician.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const activeBadge = (active: boolean) =>
    active ? (
      <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
    ) : (
      <Badge className="bg-slate-100 text-slate-600">Inactive</Badge>
    )

  const sortedProfessions = useMemo(
    () => [...professions].sort((a, b) => a.name.localeCompare(b.name)),
    [professions]
  )
  const filteredTechnicians = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return technicians.filter((tech) => {
      if (professionFilter !== 'all') {
        const hasProfession = (tech.professions || []).some((profession) => profession.id === professionFilter)
        if (!hasProfession) return false
      }

      if (!term) return true

      const haystack = [
        tech.full_name,
        tech.phone,
        tech.email,
        tech.company,
        ...(tech.professions || []).map((profession) => profession.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [professionFilter, searchTerm, technicians])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 bg-slate-50">
          <div className="mb-4">
            <Button
              asChild
              variant="outline"
              className="gap-2 border-slate-200 bg-white/80 shadow-sm hover:shadow-md"
            >
              <Link href="/dashboard/maintenance">
                <ArrowLeft className="w-4 h-4" />
                Back to Maintenance
              </Link>
            </Button>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Technicians</h1>
              <p className="text-sm text-muted-foreground">
                Maintain your technician list and their specialties for quick assignment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRefresh}
                className="gap-2"
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="w-4 h-4" />
                Add technician
              </Button>
            </div>
          </div>

          {error && (
            <Card className="mb-4 border-red-200 bg-red-50">
              <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Technician Directory</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading technicians…</p>
              ) : technicians.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No technicians added yet.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="relative md:max-w-xs">
                      <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search technicians by name, phone, or company"
                        className="pr-10"
                      />
                      {searchTerm && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setSearchTerm('')}
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Select value={professionFilter} onValueChange={setProfessionFilter}>
                      <SelectTrigger className="md:max-w-xs">
                        <SelectValue placeholder="Filter by profession" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All professions</SelectItem>
                        {sortedProfessions.map((profession) => (
                          <SelectItem key={profession.id} value={profession.id}>
                            {profession.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {filteredTechnicians.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">
                      No technicians match your filters.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                        <TableHead>Professions</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTechnicians.map((tech) => (
                            <TableRow key={tech.id}>
                              <TableCell className="font-medium">
                                <div>{tech.full_name}</div>
                                {tech.company && (
                                  <div className="text-xs text-muted-foreground">{tech.company}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {tech.professions && tech.professions.length > 0 ? (
                                    tech.professions.map((profession) => (
                                      <Badge key={profession.id} variant="secondary">
                                        {profession.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                <div>{tech.phone || '—'}</div>
                                <div className="text-xs text-muted-foreground">{tech.email || 'No email'}</div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {tech.notes ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="line-clamp-2 cursor-help">{tech.notes}</span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs whitespace-pre-line">
                                        {tech.notes}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                              <TableCell>{activeBadge(Boolean(tech.is_active))}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => openEdit(tech)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-red-600 hover:text-red-600"
                                    onClick={() => handleDelete(tech)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => {
        setModalOpen(open)
        if (!open) {
          resetForm()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit technician' : 'Add technician'}</DialogTitle>
            <DialogDescription>Store the technician details and specialties.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tech-name">Full name</Label>
              <Input
                id="tech-name"
                value={form.full_name}
                onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
                placeholder="e.g. Peter Mwangi"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tech-phone">Phone</Label>
                <Input
                  id="tech-phone"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="+2547..."
                />
              </div>
              <div>
                <Label htmlFor="tech-email">Email</Label>
                <Input
                  id="tech-email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="name@example.com"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="tech-company">Company</Label>
              <Input
                id="tech-company"
                value={form.company}
                onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Professions</Label>
              {sortedProfessions.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">No professions available.</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sortedProfessions.map((profession) => (
                    <label
                      key={profession.id}
                      className="flex items-center gap-2 text-sm border rounded-md px-3 py-2"
                    >
                      <Checkbox
                        checked={form.profession_ids.includes(profession.id)}
                        onCheckedChange={() => toggleProfession(profession.id)}
                      />
                      {profession.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active technician</p>
                <p className="text-xs text-muted-foreground">Inactive technicians cannot be assigned.</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(value) => setForm((prev) => ({ ...prev, is_active: Boolean(value) }))}
              />
            </div>
            <div>
              <Label htmlFor="tech-notes">Notes</Label>
              <Textarea
                id="tech-notes"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Extra details or preferred contact hours."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save technician'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete technician</DialogTitle>
            <DialogDescription>
              This action permanently removes the technician and their profession mappings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">
                {deleteTarget?.full_name || 'Selected technician'}
              </p>
              <p className="text-xs text-red-700/80">This cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
