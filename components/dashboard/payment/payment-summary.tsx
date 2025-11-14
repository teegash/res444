'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export function PaymentSummary() {
  return (
    <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
      <CardHeader>
        <CardTitle>Payment Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Invoice Amount:</span>
            <span className="text-2xl font-bold text-primary">KES 18,500</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Due Date:</span>
            <span className="font-semibold">February 1, 2024</span>
          </div>
        </div>

        <Alert className="bg-amber-950/20 border-amber-500/50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-600 text-sm">
            Payment is not yet due. You have until February 1st to pay.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
