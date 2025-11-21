import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { CheckCircle2, AlertCircle, Settings } from 'lucide-react'
import { IntegrationSummary, PaymentStats } from '@/components/dashboard/payment-tabs/types'

interface IntegrationStatusTabProps {
  stats?: PaymentStats
  integration?: IntegrationSummary
  loading: boolean
  onSettingsUpdated?: () => void
}

const formatCurrency = (value?: number) => {
  if (!value) return 'KES 0'
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(value)
}

const frequencyOptions = [15, 30, 45, 60, 120, 180, 300]
const retryOptions = [1, 2, 3, 4, 5, 6]
const timeoutOptions = [15, 30, 45, 60, 90, 120]

export function IntegrationStatusTab({ stats, integration, loading, onSettingsUpdated }: IntegrationStatusTabProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [viewSettings, setViewSettings] = useState(false)

  const [autoEnabled, setAutoEnabled] = useState(integration?.autoVerifyEnabled ?? false)
  const [frequency, setFrequency] = useState(integration?.autoVerifyFrequencySeconds || 30)
  const [maxRetries, setMaxRetries] = useState(integration?.maxRetries || 3)
  const [queryTimeout, setQueryTimeout] = useState(integration?.queryTimeoutSeconds || 30)

  useEffect(() => {
    setAutoEnabled(integration?.autoVerifyEnabled ?? false)
    setFrequency(integration?.autoVerifyFrequencySeconds || 30)
    setMaxRetries(integration?.maxRetries || 3)
    setQueryTimeout(integration?.queryTimeoutSeconds || 30)
  }, [integration?.autoVerifyEnabled, integration?.autoVerifyFrequencySeconds, integration?.maxRetries, integration?.queryTimeoutSeconds])

  const darajaConnected = autoEnabled
  const pendingAmount = stats?.pendingAmount || 0
  const pendingCount = stats?.pendingCount || 0
  const autoVerified = stats?.autoVerifiedAmount || 0
  const depositsAmount = stats?.depositsPendingAmount || 0
  const depositsCount = stats?.depositsPendingCount || 0
  const totalVerifiedAmount = stats?.verifiedAmount || 0
  const totalVerifiedCount = stats?.verifiedCount || 0
  const lastTestMessage = useMemo(() => {
    if (!integration?.lastTestedAt) return 'No connection tests run.'
    const status = integration.lastTestStatus || 'n/a'
    return `${new Date(integration.lastTestedAt).toLocaleString()} • ${status}`
  }, [integration?.lastTestedAt, integration?.lastTestStatus])

  const handleSettingsUpdate = async (updates: Record<string, any>) => {
    try {
      setSaving(true)
      const response = await fetch('/api/manager/payments/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update settings.')
      }
      toast({
        title: 'Settings updated',
        description: 'M-Pesa auto-verification settings saved successfully.',
      })
      onSettingsUpdated?.()
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unable to update settings.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (value: boolean) => {
    setAutoEnabled(value)
    handleSettingsUpdate({ autoVerifyEnabled: value })
  }

  const handleFrequencyChange = (value: string) => {
    const numeric = Number(value)
    setFrequency(numeric)
    handleSettingsUpdate({ autoVerifyFrequencySeconds: numeric })
  }

  const handleMaxRetryChange = (value: string) => {
    const numeric = Number(value)
    setMaxRetries(numeric)
    handleSettingsUpdate({ maxRetries: numeric })
  }

  const handleTimeoutChange = (value: string) => {
    const numeric = Number(value)
    setQueryTimeout(numeric)
    handleSettingsUpdate({ queryTimeoutSeconds: numeric })
  }

  const handleTestConnection = async () => {
    try {
      setTesting(true)
      const response = await fetch('/api/manager/payments/test-connection', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Test connection failed.')
      }
      toast({
        title: 'Connection successful',
        description: payload.message || 'Daraja API responded successfully.',
      })
      onSettingsUpdated?.()
    } catch (error) {
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Unable to reach Daraja API.',
        variant: 'destructive',
      })
      onSettingsUpdated?.()
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">M-Pesa API Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {darajaConnected ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <div>
                <p className="font-semibold">
                  {darajaConnected ? 'M-Pesa API Connected' : 'Connection Unavailable'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Daraja API Status:{' '}
                  {loading
                    ? 'Checking...'
                    : darajaConnected
                      ? 'Connected and responsive'
                      : 'Check Daraja credentials'}
                </p>
              </div>
            </div>
            <Badge className={darajaConnected ? 'bg-green-600' : 'bg-red-600'}>
              {darajaConnected ? 'Connected' : 'Offline'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
            <div>
              <p className="text-muted-foreground">Last check</p>
              <p className="font-semibold">
                {integration?.lastAutoCheck
                  ? new Date(integration.lastAutoCheck).toLocaleString()
                  : loading
                    ? 'Checking...'
                    : 'Not available'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Response time</p>
              <p className="font-semibold">~{integration?.autoVerifyFrequencySeconds || 30}s interval</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* M-Pesa Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">M-Pesa Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Shortcode</p>
              <p className="font-mono">{integration?.shortcodeMasked || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Environment</p>
              <p className="font-semibold" style={{ textTransform: 'capitalize' }}>
                {integration?.darajaEnvironment || 'sandbox'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last auto-check</p>
              <p className="font-semibold">
                {integration?.lastAutoCheck
                  ? new Date(integration.lastAutoCheck).toLocaleTimeString()
                  : 'Not recorded'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Total auto-verifications today</p>
              <p className="font-semibold">{integration?.autoVerifiedToday || 0}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">Success rate</p>
              <p className="font-semibold">
                {stats && stats.failedCount + stats.verifiedCount > 0
                  ? `${(
                      (stats.verifiedCount / (stats.verifiedCount + stats.failedCount)) *
                      100
                    ).toFixed(1)}%`
                  : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Verification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auto-Verification Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Enable auto-verify pending M-Pesa</p>
              <p className="text-xs text-muted-foreground">
                Automatically check pending STK pushes and apply verified payments.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={autoEnabled ? 'bg-green-600' : 'bg-red-600'}>
                {autoEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Switch checked={autoEnabled} onCheckedChange={handleToggle} disabled={saving} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Frequency</p>
              <Select
                value={String(frequency)}
                onValueChange={handleFrequencyChange}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Frequency" />
                </SelectTrigger>
                <SelectContent>
                  {frequencyOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      Every {value} seconds
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Max retries per payment</p>
              <Select
                value={String(maxRetries)}
                onValueChange={handleMaxRetryChange}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Retries" />
                </SelectTrigger>
                <SelectContent>
                  {retryOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} attempt{value > 1 ? 's' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Query timeout</p>
              <Select
                value={String(queryTimeout)}
                onValueChange={handleTimeoutChange}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Timeout" />
                </SelectTrigger>
                <SelectContent>
                  {timeoutOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} seconds
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground border-t pt-3">
            Last connection test: {lastTestMessage}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleTestConnection} disabled={testing}>
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button variant="outline" onClick={() => setViewSettings(true)}>
          <Settings className="w-4 h-4 mr-1" />
          View Settings
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(pendingAmount)}</p>
            <p className="text-xs text-muted-foreground">{pendingCount} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">M-Pesa Auto-Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(autoVerified)}</p>
            <p className="text-xs text-muted-foreground">{stats?.autoVerifiedCount || 0} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bank Transfer Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(depositsAmount)}</p>
            <p className="text-xs text-muted-foreground">{depositsCount} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalVerifiedAmount)}</p>
            <p className="text-xs text-muted-foreground">{totalVerifiedCount} payments</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={viewSettings} onOpenChange={setViewSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daraja Integration Settings</DialogTitle>
            <DialogDescription>
              Review the real-time configuration powering auto-verification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Environment</span>
              <span className="font-semibold text-right capitalize">
                {integration?.darajaEnvironment || 'sandbox'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shortcode</span>
              <span className="font-mono text-right">{integration?.shortcodeMasked || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Auto verify</span>
              <span className="font-semibold text-right">{autoEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Frequency</span>
              <span className="font-semibold text-right">Every {frequency} seconds</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Max retries</span>
              <span className="font-semibold text-right">{maxRetries}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Query timeout</span>
              <span className="font-semibold text-right">{queryTimeout} seconds</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last test</span>
              <span className="font-semibold text-right">{lastTestMessage}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
