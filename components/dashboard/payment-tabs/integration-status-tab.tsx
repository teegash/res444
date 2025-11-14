import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export function IntegrationStatusTab() {
  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">M-Pesa API Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-semibold">M-Pesa API Connected</p>
                <p className="text-sm text-muted-foreground">Daraja API Status: Connected and responsive</p>
              </div>
            </div>
            <Badge className="bg-green-600">Connected</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
            <div>
              <p className="text-muted-foreground">Last check</p>
              <p className="font-semibold">5 seconds ago</p>
            </div>
            <div>
              <p className="text-muted-foreground">Response time</p>
              <p className="font-semibold">145ms</p>
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
              <p className="font-mono">••••••</p>
            </div>
            <div>
              <p className="text-muted-foreground">Environment</p>
              <p className="font-semibold">Production</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last auto-check</p>
              <p className="font-semibold">2 minutes ago</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total auto-verifications today</p>
              <p className="font-semibold">23</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">Success rate</p>
              <p className="font-semibold">95.7%</p>
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
            <Badge className="bg-green-600">Enabled</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
            <div>
              <p className="text-muted-foreground">Frequency</p>
              <p className="font-semibold">Every 30 seconds</p>
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
        <Button>Test Connection</Button>
        <Button variant="outline">View Settings</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">KES 85,000</p>
            <p className="text-xs text-muted-foreground">5 payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">M-Pesa Auto-Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">KES 450,000</p>
            <p className="text-xs text-muted-foreground">45 payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bank Transfer Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">KES 60,000</p>
            <p className="text-xs text-muted-foreground">4 payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">KES 570,000</p>
            <p className="text-xs text-muted-foreground">57 payments</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
