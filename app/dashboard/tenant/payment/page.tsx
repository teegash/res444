'use client'

import { useState } from 'react'
import { ArrowLeft, Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function PaymentPage() {
  const [selectedMethod, setSelectedMethod] = useState('mpesa')
  const [phoneNumber, setPhoneNumber] = useState('254712345678')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0])
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/30 via-white to-white">
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <span className="text-xl">💳</span>
            </div>
            <h1 className="text-2xl font-bold">Make Payment</h1>
          </div>
        </div>

        {/* Payment Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
            <CardDescription>Review your payment details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tenant:</p>
                <p className="font-semibold">John Kamau</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Property:</p>
                <p className="font-semibold">Kilimani Heights</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Unit:</p>
                <p className="font-semibold">A-101</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Payment For:</p>
                <p className="font-semibold">January 2025</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Due Date:</p>
                <p className="font-semibold">January 1, 2025</p>
              </div>
            </div>
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold">Total Amount:</p>
                <p className="text-3xl font-bold text-green-600">KES 45,000</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
            <CardDescription>Choose your preferred payment method</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedMethod} onValueChange={setSelectedMethod} className="space-y-3">
              <div className="flex items-center space-x-3 p-4 border-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer border-green-500 bg-green-50">
                <RadioGroupItem value="mpesa" id="mpesa" />
                <Label htmlFor="mpesa" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📱</span>
                    <div>
                      <p className="font-semibold">M-Pesa</p>
                      <p className="text-xs text-muted-foreground">Pay using your M-Pesa mobile money</p>
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                <RadioGroupItem value="bank" id="bank" />
                <Label htmlFor="bank" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏦</span>
                    <div>
                      <p className="font-semibold">Bank Transfer</p>
                      <p className="text-xs text-muted-foreground">Direct bank transfer</p>
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                <RadioGroupItem value="card" id="card" />
                <Label htmlFor="card" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💳</span>
                    <div>
                      <p className="font-semibold">Credit/Debit Card</p>
                      <p className="text-xs text-muted-foreground">Pay with Visa or Mastercard</p>
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* M-Pesa Payment Details */}
        {selectedMethod === 'mpesa' && (
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader>
              <CardTitle>M-Pesa Payment Details</CardTitle>
              <CardDescription>Enter your M-Pesa phone number</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You will receive an M-Pesa prompt on your phone to complete the payment
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="254712345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">You will receive a prompt on your phone to complete the payment</p>
              </div>
              <div className="bg-green-100 p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">How to pay:</p>
                <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
                  <li>Enter your M-Pesa registered phone number</li>
                  <li>Click &quot;Pay Now&quot; below</li>
                  <li>You&apos;ll receive an STK push on your phone</li>
                  <li>Enter your M-Pesa PIN to complete the payment</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bank Transfer Details */}
        {selectedMethod === 'bank' && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle>Bank Transfer Details</CardTitle>
              <CardDescription>Use these details to make your bank transfer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Transfer to our bank account and upload the deposit slip for verification. Your payment will be confirmed within 24 hours.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-white rounded border">
                  <span className="text-sm text-muted-foreground">Bank Name:</span>
                  <span className="font-semibold">Equity Bank</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white rounded border">
                  <span className="text-sm text-muted-foreground">Account Name:</span>
                  <span className="font-semibold">RentMaster Ltd</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white rounded border">
                  <span className="text-sm text-muted-foreground">Account Number:</span>
                  <span className="font-semibold">0123456789</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white rounded border">
                  <span className="text-sm text-muted-foreground">Reference:</span>
                  <span className="font-semibold">UNIT-A101-JAN2025</span>
                </div>
              </div>
              
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="depositSlip">Upload Deposit Slip *</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">
                    {uploadedFile ? (
                      <span className="text-green-600 font-medium flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        {uploadedFile.name}
                      </span>
                    ) : (
                      'Click to upload or drag and drop'
                    )}
                  </p>
                  <Input 
                    id="depositSlip"
                    type="file" 
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Label htmlFor="depositSlip">
                    <Button variant="outline" type="button" asChild>
                      <span>Choose File</span>
                    </Button>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-2">
                    Supported formats: JPG, PNG, PDF (Max 5MB)
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="transactionRef">Transaction Reference (Optional)</Label>
                <Input 
                  id="transactionRef" 
                  placeholder="Enter bank transaction reference number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Any additional information about your payment"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Card Payment Details */}
        {selectedMethod === 'card' && (
          <Card>
            <CardHeader>
              <CardTitle>Card Payment Details</CardTitle>
              <CardDescription>Enter your card information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input id="cardNumber" placeholder="1234 5678 9012 3456" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiry">Expiry Date</Label>
                  <Input id="expiry" placeholder="MM/YY" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cvv">CVV</Label>
                  <Input id="cvv" placeholder="123" type="password" maxLength={3} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardName">Cardholder Name</Label>
                <Input id="cardName" placeholder="JOHN KAMAU" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button variant="outline" className="flex-1" asChild>
            <Link href="/dashboard/tenant">Cancel</Link>
          </Button>
          <Button 
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={selectedMethod === 'bank' && !uploadedFile}
          >
            {selectedMethod === 'bank' ? (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Submit for Verification
              </>
            ) : (
              <>Pay Now - KES 45,000</>
            )}
          </Button>
        </div>
        
        {/* Help Section */}
        {selectedMethod === 'bank' && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Important Information
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Ensure you use the correct reference code when making the transfer</li>
                <li>Upload a clear photo or scan of your deposit slip</li>
                <li>Your payment will be verified by the caretaker or manager</li>
                <li>You will receive a confirmation once payment is approved</li>
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
