'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2, Loader2, AlertCircle, Copy } from 'lucide-react'

export function MPesaPaymentFlow() {
  const [step, setStep] = useState(1)
  const [phoneNumber, setPhoneNumber] = useState('+254712345678')
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  const handleSendSTK = () => {
    setIsProcessing(true)
    setTimeout(() => {
      setIsProcessing(false)
      setPaymentSuccess(true)
    }, 3000)
  }

  if (paymentSuccess) {
    return (
      <Card className="bg-green-950/20 border-green-500/50">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-green-600">Payment Successful!</h3>
              <p className="text-sm text-muted-foreground mt-2">Your payment has been confirmed.</p>
            </div>
            <div className="bg-green-950/30 p-4 rounded-lg space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Receipt Number:</span>
                <span className="font-mono text-sm font-semibold">TXN-2024-001845</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Amount:</span>
                <span className="font-semibold">KES 18,500</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Date & Time:</span>
                <span className="text-sm">Feb 3, 2024 • 2:45 PM</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">Download Receipt</Button>
              <Button className="flex-1">Back to Dashboard</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>M-Pesa Payment</CardTitle>
        <CardDescription>Complete your payment using M-Pesa STK prompt</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step Indicators */}
        <div className="flex gap-4 relative">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`flex-1 text-center ${s <= step ? 'opacity-100' : 'opacity-50'}`}
            >
              <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center mb-2 text-xs font-semibold ${
                s < step ? 'bg-green-500 text-white' :
                s === step ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {s < step ? '✓' : s}
              </div>
              <p className="text-xs font-semibold">
                {s === 1 ? 'Verify' : s === 2 ? 'Phone' : s === 3 ? 'Instructions' : 'Confirm'}
              </p>
            </div>
          ))}
        </div>

        {/* Step 1: Amount Verification */}
        {step === 1 && (
          <div className="space-y-4">
            <Alert className="bg-blue-950/20 border-blue-500/50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-600 text-sm">
                Confirm the amount you're paying today
              </AlertDescription>
            </Alert>
            <div className="bg-muted p-4 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">Payment Amount</p>
              <p className="text-3xl font-bold text-primary">KES 18,500</p>
            </div>
            <Button className="w-full" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Phone Number */}
        {step === 2 && (
          <div className="space-y-4">
            <Alert className="bg-blue-950/20 border-blue-500/50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-600 text-sm">
                Enter your M-Pesa registered phone number
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>M-Pesa Phone Number</Label>
              <Input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+254712345678"
              />
              <p className="text-xs text-muted-foreground">Must start with +254 (Kenya) and be 13 digits</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Instructions */}
        {step === 3 && (
          <div className="space-y-4">
            <Alert className="bg-amber-950/20 border-amber-500/50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-600 text-sm">
                You will receive an STK prompt on your phone shortly
              </AlertDescription>
            </Alert>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 text-primary font-semibold text-sm">1</div>
                <div>
                  <p className="font-semibold text-sm">Click the button below</p>
                  <p className="text-xs text-muted-foreground">Request the M-Pesa STK prompt</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 text-primary font-semibold text-sm">2</div>
                <div>
                  <p className="font-semibold text-sm">Look for popup on your phone</p>
                  <p className="text-xs text-muted-foreground">An STK prompt will appear automatically</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 text-primary font-semibold text-sm">3</div>
                <div>
                  <p className="font-semibold text-sm">Enter your M-Pesa PIN</p>
                  <p className="text-xs text-muted-foreground">Complete the transaction on your phone</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 text-primary font-semibold text-sm">4</div>
                <div>
                  <p className="font-semibold text-sm">Payment confirmed</p>
                  <p className="text-xs text-muted-foreground">You'll see a confirmation message here</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(4)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Send STK */}
        {step === 4 && (
          <div className="space-y-4">
            <Alert className="bg-green-950/20 border-green-500/50">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-600 text-sm">
                Ready to proceed? Click the button to send M-Pesa code
              </AlertDescription>
            </Alert>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Sending to</p>
              <p className="font-semibold flex items-center gap-2">
                {phoneNumber}
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Copy className="h-3 w-3" />
                </Button>
              </p>
            </div>
            <Button
              className="w-full h-12 text-base font-semibold gap-2"
              disabled={isProcessing}
              onClick={handleSendSTK}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending M-Pesa Code...
                </>
              ) : (
                'Send M-Pesa STK Prompt'
              )}
            </Button>
            <Button variant="outline" className="w-full" disabled={isProcessing}>
              Change Phone Number
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
