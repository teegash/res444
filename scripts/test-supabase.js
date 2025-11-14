#!/usr/bin/env node

/**
 * Supabase Integration Test Script
 * 
 * Run this script to test all Supabase integrations from the command line
 * 
 * Usage:
 *   node scripts/test-supabase.js
 *   npm run test:supabase (if added to package.json)
 */

const https = require('https')
const http = require('http')

// Get base URL from environment or use default
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const TEST_ENDPOINT = `${BASE_URL}/api/test/supabase`

console.log('🧪 Supabase Integration Test Suite')
console.log('=====================================\n')
console.log(`Testing endpoint: ${TEST_ENDPOINT}\n`)

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://')
    const client = isHttps ? https : http

    const req = client.get(url, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch (error) {
          resolve({ status: res.statusCode, data: { error: 'Invalid JSON response', raw: data } })
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

async function runTests() {
  try {
    console.log('⏳ Running tests...\n')

    const { status, data } = await makeRequest(TEST_ENDPOINT)

    if (status !== 200 && status !== 500) {
      console.error(`❌ HTTP Error: ${status}`)
      console.error('Response:', data)
      process.exit(1)
    }

    // Display summary
    console.log('📊 Test Summary')
    console.log('─'.repeat(50))
    console.log(`Total Tests:  ${data.summary?.total || 0}`)
    console.log(`✅ Passed:    ${data.summary?.passed || 0}`)
    console.log(`❌ Failed:    ${data.summary?.failed || 0}`)
    console.log(`⚠️  Warnings:  ${data.summary?.warnings || 0}`)
    console.log(`Status:       ${data.status?.toUpperCase() || 'UNKNOWN'}`)
    console.log('─'.repeat(50))
    console.log()

    // Display individual test results
    if (data.results && data.results.length > 0) {
      console.log('📋 Test Results')
      console.log('─'.repeat(50))

      data.results.forEach((result, index) => {
        const icon =
          result.status === 'pass'
            ? '✅'
            : result.status === 'fail'
              ? '❌'
              : '⚠️ '
        const statusColor =
          result.status === 'pass'
            ? '\x1b[32m'
            : result.status === 'fail'
              ? '\x1b[31m'
              : '\x1b[33m'
        const reset = '\x1b[0m'

        console.log(
          `${icon} ${index + 1}. ${result.name} - ${statusColor}${result.status.toUpperCase()}${reset}`
        )
        console.log(`   ${result.message}`)

        if (result.details) {
          console.log(`   Details: ${JSON.stringify(result.details, null, 2).replace(/\n/g, '\n   ')}`)
        }
        console.log()
      })
    }

    // Exit with appropriate code
    if (data.summary?.failed > 0) {
      console.log('❌ Some tests failed. Please review the results above.')
      process.exit(1)
    } else if (data.summary?.warnings > 0) {
      console.log('⚠️  Tests completed with warnings. Review the results above.')
      process.exit(0)
    } else {
      console.log('✅ All tests passed!')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Test execution failed:')
    console.error(error.message)

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Tip: Make sure your Next.js development server is running:')
      console.error('   npm run dev')
    }

    process.exit(1)
  }
}

// Run tests
runTests()

