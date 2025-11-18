'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Search, Eye, Download } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

const statementsData = [
  { id: 'STMT-JK-2024-H2', tenant: 'John Kamau', property: 'Kilimani Heights', unit: 'Unit A-101', period: 'July - December 2024', generated: 'Dec 31, 2024' },
  { id: 'STMT-MW-2024-H2', tenant: 'Mary Wanjiku', property: 'Westlands Plaza', unit: 'Unit B-205', period: 'July - December 2024', generated: 'Dec 31, 2024' },
  { id: 'STMT-PO-2024-H2', tenant: 'Peter Ochieng', property: 'Karen Villas', unit: 'Unit C-301', period: 'July - December 2024', generated: 'Dec 31, 2024' },
  { id: 'STMT-GA-2024-H2', tenant: 'Grace Akinyi', property: 'Kilimani Heights', unit: 'Unit A-203', period: 'July - December 2024', generated: 'Dec 31, 2024' },
  { id: 'STMT-DK-2024-H2', tenant: 'David Kiprop', property: 'Eastlands Court', unit: 'Unit B-102', period: 'July - December 2024', generated: 'Dec 31, 2024' },
  { id: 'STMT-JK-2024-H1', tenant: 'John Kamau', property: 'Kilimani Heights', unit: 'Unit A-101', period: 'January - June 2024', generated: 'Jun 30, 2024' },
  { id: 'STMT-MW-2024-H1', tenant: 'Mary Wanjiku', property: 'Westlands Plaza', unit: 'Unit B-205', period: 'January - June 2024', generated: 'Jun 30, 2024' },
  { id: 'STMT-PO-2024-H1', tenant: 'Peter Ochieng', property: 'Karen Villas', unit: 'Unit C-301', period: 'January - June 2024', generated: 'Jun 30, 2024' },
]

export default function StatementsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6 text-[#4682B4]" />
              </div>
              <h1 className="text-3xl font-bold">Financial Statements</h1>
            </div>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export All
            </Button>
          </div>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Filter Statements</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search tenant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  <SelectItem value="1">Kilimani Heights</SelectItem>
                  <SelectItem value="2">Westlands Plaza</SelectItem>
                  <SelectItem value="3">Karen Villas</SelectItem>
                  <SelectItem value="4">Eastlands Court</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  <SelectItem value="h1-2024">H1 2024</SelectItem>
                  <SelectItem value="h2-2024">H2 2024</SelectItem>
                  <SelectItem value="h1-2023">H1 2023</SelectItem>
                  <SelectItem value="h2-2023">H2 2023</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">All Statements</h2>
            <p className="text-sm text-gray-600 mb-4">Financial statements for all tenants</p>

            <div className="space-y-3">
              {statementsData.map((statement) => (
                <Card key={statement.id} className="p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">{statement.tenant}</h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {statement.property} • {statement.unit}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Generated: {statement.generated}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900 mb-1">{statement.period}</div>
                        <div className="text-sm text-gray-500">Generated: {statement.generated}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/dashboard/manager/statements/${statement.id}`)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
