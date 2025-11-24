'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

type ThemeOption = 'light' | 'dark' | 'system'

function applyTheme(theme: ThemeOption) {
  const root = document.documentElement
  const stored = theme === 'system' ? '' : theme
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  } else if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  localStorage.setItem('rk-theme', stored)
}

export default function PreferencesPage() {
  const [theme, setTheme] = useState<ThemeOption>('system')
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    const stored = (localStorage.getItem('rk-theme') as ThemeOption | null) || 'system'
    setTheme(stored)
    applyTheme(stored)
  }, [])

  const handleThemeChange = (value: ThemeOption) => {
    setTheme(value)
    applyTheme(value)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Preferences</h1>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={(v) => handleThemeChange(v as ThemeOption)}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Instantly toggles between light and dark UI.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data & Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-refresh dashboards</p>
              <p className="text-sm text-muted-foreground">Refresh key dashboard widgets every 5 minutes.</p>
            </div>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: leave this off to reduce network usage on slow connections.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
