'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileDown, FileText } from 'lucide-react'

const documents = [
  { id: 1, name: 'Lease Agreement', uploadDate: '2024-01-01', size: '2.5 MB' },
  { id: 2, name: 'Tenancy Certificate', uploadDate: '2024-01-02', size: '1.2 MB' },
  { id: 3, name: 'January 2024 Receipt', uploadDate: '2024-01-05', size: '0.8 MB' },
]

export function DocumentsTab() {
  return (
    <div className="space-y-4 mt-6">
      <Card>
        <CardHeader>
          <CardTitle>My Documents</CardTitle>
          <CardDescription>Important documents related to your tenancy</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-sm">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.uploadDate} • {doc.size}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="gap-2">
                  <FileDown className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
