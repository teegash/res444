'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: any
}

interface TestResponse {
  success: boolean
  status: 'pass' | 'fail' | 'warning'
  summary: {
    total: number
    passed: number
    failed: number
    warnings: number
  }
  results: TestResult[]
  timestamp: string
}

export default function SupabaseTestPage() {
  const [loading, setLoading] = useState(false)
  const [testResults, setTestResults] = useState<TestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runTests = async () => {
    setLoading(true)
    setError(null)
    setTestResults(null)

    try {
      const response = await fetch('/api/test/supabase')
      const data = await response.json()

      if (data.success === false && data.error) {
        setError(data.error || data.message || 'Test failed')
      } else {
        setTestResults(data)
      }
    } catch (err) {
      setError('Failed to run tests. Check console for details.')
      console.error('Test error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'fail':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'border-green-500 bg-green-50'
      case 'fail':
        return 'border-red-500 bg-red-50'
      case 'warning':
        return 'border-yellow-500 bg-yellow-50'
      default:
        return 'border-gray-300 bg-gray-50'
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Supabase Integration Tests</h1>
        <p className="text-gray-600">
          Comprehensive test suite for all Supabase integrations
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={runTests} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Tests...
              </>
            ) : (
              'Run All Tests'
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-500 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              <p className="font-semibold">Error: {error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {testResults && (
        <>
          {/* Summary Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Test Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{testResults.summary.total}</div>
                  <div className="text-sm text-gray-600">Total Tests</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {testResults.summary.passed}
                  </div>
                  <div className="text-sm text-gray-600">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {testResults.summary.failed}
                  </div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {testResults.summary.warnings}
                  </div>
                  <div className="text-sm text-gray-600">Warnings</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600">
                  Last run: {new Date(testResults.timestamp).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Test Results */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">Test Results</h2>
            {testResults.results.map((result, index) => (
              <Card
                key={index}
                className={`border-2 ${getStatusColor(result.status)}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      {result.name}
                    </CardTitle>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        result.status === 'pass'
                          ? 'bg-green-100 text-green-800'
                          : result.status === 'fail'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {result.status.toUpperCase()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-2">{result.message}</p>
                  {result.details && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                        View Details
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {!testResults && !loading && !error && (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            <p>Click "Run All Tests" to start testing Supabase integrations</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

