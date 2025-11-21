'use client'

import { Download, Printer, Share2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Sidebar from '@/components/dashboard/sidebar'
import Link from 'next/link'

const statementData: Record<
  string,
  {
    tenant: string
    property: string
    unit: string
    statementDate: string
    period: string
    openingBalance: number
    transactions: { date: string; type: 'Rent' | 'Water'; description: string; reference: string; amount: number; balance: number }[]
  }
> = {
  'john-kamau': {
    tenant: 'John Kamau',
    property: 'Kilimani Heights',
    unit: 'Unit A-101',
    statementDate: 'Dec 31, 2024',
    period: 'July - December 2024',
    openingBalance: 0,
    transactions: [
      { date: 'Jul 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 45000, balance: 45000 },
      { date: 'Jul 1, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'QK12345670', amount: -45000, balance: 0 },
      { date: 'Aug 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 45000, balance: 45000 },
      { date: 'Aug 1, 2024', type: 'Rent', description: 'Rent Payment (Card)', reference: 'QK12345671', amount: -45000, balance: 0 },
      { date: 'Sep 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 45000, balance: 45000 },
      { date: 'Sep 1, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'QK12345672', amount: -45000, balance: 0 },
      { date: 'Sep 10, 2024', type: 'Water', description: 'Water Bill - September', reference: 'WB-SEP-2024', amount: 3200, balance: 3200 },
      { date: 'Sep 12, 2024', type: 'Water', description: 'Water Payment (M-Pesa)', reference: 'MPW102', amount: -3200, balance: 0 },
      { date: 'Oct 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 45000, balance: 45000 },
      { date: 'Oct 3, 2024', type: 'Rent', description: 'Rent Payment (Bank)', reference: 'BK99342', amount: -45000, balance: 0 },
      { date: 'Nov 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 45000, balance: 45000 },
      { date: 'Nov 1, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'QK12345674', amount: -45000, balance: 0 },
      { date: 'Dec 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 45000, balance: 45000 },
      { date: 'Dec 1, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'QK12345678', amount: -45000, balance: 0 },
    ],
  },
  'mary-wanjiku': {
    tenant: 'Mary Wanjiku',
    property: 'Westlands Plaza',
    unit: 'Unit B-205',
    statementDate: 'Dec 15, 2024',
    period: 'August - December 2024',
    openingBalance: 0,
    transactions: [
      { date: 'Aug 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 38000, balance: 38000 },
      { date: 'Aug 2, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'MWP4001', amount: -38000, balance: 0 },
      { date: 'Sep 5, 2024', type: 'Water', description: 'Water Bill - September', reference: 'WB-SEP-MW', amount: 2500, balance: 2500 },
      { date: 'Sep 7, 2024', type: 'Water', description: 'Water Payment (Card)', reference: 'CARD222', amount: -2500, balance: 0 },
      { date: 'Sep 15, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 38000, balance: 38000 },
      { date: 'Sep 16, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'MWP4102', amount: -38000, balance: 0 },
      { date: 'Oct 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 38000, balance: 38000 },
      { date: 'Oct 5, 2024', type: 'Rent', description: 'Rent Payment (Bank)', reference: 'BK-00123', amount: -38000, balance: 0 },
      { date: 'Nov 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 38000, balance: 38000 },
      { date: 'Nov 30, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'MWP4300', amount: -38000, balance: 0 },
      { date: 'Dec 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 38000, balance: 38000 },
      { date: 'Dec 14, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'MWP4400', amount: -38000, balance: 0 },
    ],
  },
  'peter-ochieng': {
    tenant: 'Peter Ochieng',
    property: 'Karen Villas',
    unit: 'Unit C-301',
    statementDate: 'Dec 31, 2024',
    period: 'July - December 2024',
    openingBalance: 12000,
    transactions: [
      { date: 'Jul 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 52000, balance: 64000 },
      { date: 'Jul 2, 2024', type: 'Rent', description: 'Partial Payment (M-Pesa)', reference: 'PO8123', amount: -30000, balance: 34000 },
      { date: 'Jul 15, 2024', type: 'Rent', description: 'Partial Payment (Card)', reference: 'CARD-PO1', amount: -22000, balance: 12000 },
      { date: 'Aug 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 52000, balance: 64000 },
      { date: 'Aug 5, 2024', type: 'Water', description: 'Water Bill - August', reference: 'WB-AUG-PO', amount: 3100, balance: 67100 },
      { date: 'Aug 6, 2024', type: 'Water', description: 'Water Payment (M-Pesa)', reference: 'POW100', amount: -3100, balance: 64000 },
      { date: 'Aug 30, 2024', type: 'Rent', description: 'Rent Payment (Bank)', reference: 'BK-00999', amount: -52000, balance: 12000 },
      { date: 'Sep 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 52000, balance: 64000 },
      { date: 'Sep 15, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'PO9002', amount: -52000, balance: 12000 },
      { date: 'Oct 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 52000, balance: 64000 },
      { date: 'Oct 2, 2024', type: 'Rent', description: 'Rent Payment (M-Pesa)', reference: 'PO9100', amount: -52000, balance: 12000 },
      { date: 'Nov 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 52000, balance: 64000 },
      { date: 'Nov 3, 2024', type: 'Rent', description: 'Rent Payment (Card)', reference: 'CARD-PO2', amount: -52000, balance: 12000 },
      { date: 'Dec 1, 2024', type: 'Rent', description: 'Rent Charge', reference: '-', amount: 52000, balance: 64000 },
      { date: 'Dec 5, 2024', type: 'Rent', description: 'Partial Payment (Bank)', reference: 'BK-01000', amount: -40000, balance: 24000 },
      { date: 'Dec 20, 2024', type: 'Rent', description: 'Partial Payment (M-Pesa)', reference: 'PO9200', amount: -24000, balance: 0 },
    ],
  },
}

export default function StatementPage({ params }: { params: { id: string } }) {
  const statement = statementData[params.id]

  if (!statement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold">Statement not found for this tenant.</p>
          <Link href="/dashboard/manager/tenants">
            <Button>Back to tenant management</Button>
          </Link>
        </div>
      </div>
    )
  }

  const closingBalance =
    statement.transactions.length > 0
      ? statement.transactions[statement.transactions.length - 1].balance
      : statement.openingBalance

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 ml-16">
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Tenant Account Statement</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>

          {/* Statement Preview */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-8 md:p-12">
              {/* Header */}
              <div className="flex items-start justify-between mb-8 pb-6 border-b">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <span className="text-2xl">🏢</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-green-600">RentalKenya</h2>
                    <p className="text-sm text-muted-foreground">Property Management</p>
                  </div>
                </div>
                  <div className="text-right">
                    <h3 className="text-xl font-bold">ACCOUNT STATEMENT</h3>
                    <p className="text-sm text-muted-foreground">#{params.id}</p>
                  </div>
              </div>

              {/* Statement Info */}
              <div className="grid md:grid-cols-2 gap-8 mb-8">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Tenant</p>
                  <p className="font-semibold text-lg">{statement.tenant}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground mb-1">Statement Date</p>
                  <p className="font-semibold">{statement.statementDate}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Property</p>
                  <p className="font-semibold">
                    {statement.property} - {statement.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground mb-1">Statement Period</p>
                  <p className="font-semibold">{statement.period}</p>
                </div>
              </div>

              {/* Balance Summary */}
              <div className="grid md:grid-cols-2 gap-6 mb-8 p-6 bg-blue-50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Opening Balance</p>
                  <p className="text-2xl font-bold">KES {statement.openingBalance.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground mb-1">Closing Balance</p>
                  <p className="text-2xl font-bold text-green-600">KES {closingBalance.toLocaleString()}</p>
                </div>
              </div>

              {/* Transaction History */}
              <div className="mb-8">
                <h3 className="font-semibold text-lg mb-4">Transaction History</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-sm">Date</th>
                        <th className="text-left p-3 font-semibold text-sm">Type</th>
                        <th className="text-left p-3 font-semibold text-sm">Description</th>
                        <th className="text-left p-3 font-semibold text-sm">Reference</th>
                        <th className="text-right p-3 font-semibold text-sm">Amount</th>
                        <th className="text-right p-3 font-semibold text-sm">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.transactions.map((txn, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-3 text-sm">{txn.date}</td>
                          <td className="p-3 text-sm font-semibold">{txn.type}</td>
                          <td className="p-3 text-sm">{txn.description}</td>
                          <td className="p-3 text-sm">{txn.reference}</td>
                          <td className={`p-3 text-sm text-right font-semibold ${txn.amount < 0 ? 'text-green-600' : ''}`}>
                            {txn.amount < 0 ? '-' : ''}KES {Math.abs(txn.amount).toLocaleString()}
                          </td>
                          <td className="p-3 text-sm text-right font-semibold">
                            KES {txn.balance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer Note */}
              <div className="bg-blue-50 p-4 rounded-lg text-sm text-center mb-6">
                <p className="font-medium mb-1">This statement is a summary of your account activity for the specified period.</p>
                <p className="text-muted-foreground">
                  For any inquiries, please contact us at support@rentalkenya.com or call +254 712 345 678
                </p>
              </div>

              {/* Footer */}
              <div className="pt-6 border-t text-center text-sm text-muted-foreground">
                <p>RentalKenya Ltd. | P.O. Box 12345-00100, Nairobi | www.rentalkenya.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
