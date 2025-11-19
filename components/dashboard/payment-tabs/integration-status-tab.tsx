import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { IntegrationSummary, PaymentStats } from '@/components/dashboard/payment-tabs/types'

interface IntegrationStatusTabProps {
  stats?: PaymentStats
  integration?: IntegrationSummary
  loading: boolean
}

const formatCurrency = (value?: number) => {
  if (!value) return 'KES 0'
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(value)
}

export function IntegrationStatusTab({ stats, integration, loading }: IntegrationStatusTabProps) {
  const darajaConnected = integration?.autoVerifyEnabled ?? false
  const pendingAmount = stats?.pendingAmount || 0
  const pendingCount = stats?.pendingCount || 0
  const autoVerified = stats?.autoVerifiedAmount || 0
  const depositsAmount = stats?.depositsPendingAmount || 0
  const depositsCount = stats?.depositsPendingCount || 0
  const totalVerifiedAmount = stats?.verifiedAmount || 0
  const totalVerifiedCount = stats?.verifiedCount || 0

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
        <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span>Enable auto-verify pending M-Pesa</span>
              <Badge className={darajaConnected ? 'bg-green-600' : 'bg-red-600'}>
                {darajaConnected ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
              <div>
                <p className="text-muted-foreground">Frequency</p>
                <p className="font-semibold">
                  Every {integration?.autoVerifyFrequencySeconds || 30} seconds
                </p>
              </div>
            <div>
              <p className="text-muted-foreground">Max retries per payment</p>
              <p className="font-semibold">3</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">Timeout per query</p>
              <p className="font-semibold">30 seconds</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button disabled={!darajaConnected}>Test Connection</Button>
        <Button variant="outline">View Settings</Button>
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
    </div>
  )
}
