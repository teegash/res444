'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'

export function AlternativePaymentMethods({ selectedMethod }) {
  const methods = {
    bank: {
      title: 'Bank Transfer Details',
      content: (
        <div className="space-y-3">
          <Alert>
            <AlertDescription>
              Transfer the amount to the following account details
            </AlertDescription>
          </Alert>
          <div className="space-y-2 bg-muted p-4 rounded-lg">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bank Name:</span>
              <span className="font-semibold">Equity Bank Kenya</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account Name:</span>
              <span className="font-semibold">RES Ltd</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account Number:</span>
              <span className="font-mono font-semibold">0273891234567</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Branch Code:</span>
              <span className="font-mono font-semibold">018001</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-bold text-primary">KES 18,500</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Include your reference number (Unit 12B) in the transfer memo for identification
          </p>
        </div>
      )
    },
    cheque: {
      title: 'Cheque Payment Instructions',
      content: (
        <div className="space-y-3">
          <Alert>
            <AlertDescription>
              Send cheque to the address below
            </AlertDescription>
          </Alert>
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="font-semibold">Mail Cheque To:</p>
            <p className="text-sm">RES Ltd<br />Westlands Plaza<br />Nairobi, Kenya 00100</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-semibold">Cheque Details:</p>
            <div className="text-sm space-y-1">
              <p>Payee: RES Ltd</p>
              <p>Amount: KES 18,500</p>
              <p>Reference: Unit 12B</p>
            </div>
          </div>
        </div>
      )
    },
    cash: {
      title: 'Cash Payment Details',
      content: (
        <div className="space-y-3">
          <Alert>
            <AlertDescription>
              Pay cash through your building caretaker
            </AlertDescription>
          </Alert>
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="font-semibold text-sm">Caretaker Details:</p>
            <p className="text-sm">Name: David Kipchoge</p>
            <p className="text-sm">Building: Westlands Plaza, Unit 12B</p>
            <p className="text-sm">Phone: +254712345678</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-semibold">Important:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Request a receipt for your records</li>
              <li>• Amount: KES 18,500</li>
              <li>• Payment deadline: February 1, 2024</li>
            </ul>
          </div>
        </div>
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {selectedMethod === 'bank' ? 'Bank Transfer Details' :
           selectedMethod === 'cheque' ? 'Cheque Payment' :
           'Cash Payment'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {methods[selectedMethod]?.content}
      </CardContent>
    </Card>
  )
}
