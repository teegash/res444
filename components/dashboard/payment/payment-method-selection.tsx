'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Smartphone, Building2, DollarSign, CreditCard } from 'lucide-react'

const paymentMethods = [
  { id: 'mpesa', label: 'M-Pesa', icon: Smartphone, description: 'Pay with M-Pesa STK Prompt' },
  { id: 'bank', label: 'Bank Transfer', icon: Building2, description: 'Direct bank account transfer' },
  { id: 'cheque', label: 'Cheque', icon: DollarSign, description: 'Pay by cheque' },
  { id: 'cash', label: 'Cash', icon: CreditCard, description: 'Pay through caretaker' },
]

export function PaymentMethodSelection({ selectedMethod, onMethodChange }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Method</CardTitle>
        <CardDescription>Select your preferred payment method</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={selectedMethod} onValueChange={onMethodChange}>
          <div className="space-y-4">
            {paymentMethods.map((method) => {
              const Icon = method.icon
              return (
                <div key={method.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value={method.id} id={method.id} />
                  <Label htmlFor={method.id} className="flex-1 cursor-pointer flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-semibold">{method.label}</p>
                      <p className="text-sm text-muted-foreground">{method.description}</p>
                    </div>
                  </Label>
                </div>
              )
            })}
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
