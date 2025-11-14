import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const utilityData = [
  { unit: 'Unit 101', month: 'June 2024', amount: 5000, status: 'Paid' },
  { unit: 'Unit 205', month: 'June 2024', amount: 4500, status: 'Paid' },
  { unit: 'Unit 312', month: 'June 2024', amount: 6000, status: 'Pending' },
  { unit: 'Unit 401', month: 'June 2024', amount: 5500, status: 'Overdue' },
]

export function UtilityReportsTab() {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">Select Utility</label>
        <Select defaultValue="water">
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="water">Water</SelectItem>
            <SelectItem value="electricity">Electricity</SelectItem>
            <SelectItem value="waste">Waste Management</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {utilityData.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{row.unit}</TableCell>
                <TableCell>{row.month}</TableCell>
                <TableCell>KES {row.amount.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.status === 'Paid'
                        ? 'default'
                        : row.status === 'Overdue'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {row.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
