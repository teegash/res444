import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Eye } from 'lucide-react'

const monthlyData = [
  {
    month: 'June 2024',
    invoiced: 1250000,
    paid: 1200000,
    outstanding: 50000,
    collection: 96,
  },
  {
    month: 'May 2024',
    invoiced: 750000,
    paid: 720000,
    outstanding: 30000,
    collection: 96,
  },
  {
    month: 'April 2024',
    invoiced: 650000,
    paid: 620000,
    outstanding: 30000,
    collection: 95.4,
  },
  {
    month: 'March 2024',
    invoiced: 480000,
    paid: 460000,
    outstanding: 20000,
    collection: 95.8,
  },
]

export function MonthlyReportsTab() {
  return (
    <div className="space-y-6">
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Invoiced</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Collection %</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthlyData.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{row.month}</TableCell>
                <TableCell>KES {row.invoiced.toLocaleString()}</TableCell>
                <TableCell className="text-green-600">
                  KES {row.paid.toLocaleString()}
                </TableCell>
                <TableCell className="text-orange-600">
                  KES {row.outstanding.toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 max-w-xs h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600"
                        style={{ width: `${row.collection}%` }}
                      />
                    </div>
                    <span>{row.collection}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="gap-1">
                      <Eye className="w-4 h-4" />
                      View
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
