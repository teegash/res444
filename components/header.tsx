'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Building2 } from 'lucide-react'

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg text-primary leading-none">RentalKenya</span>
            <span className="text-xs text-accent font-medium">Premium Property Management</span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition">Features</a>
          <a href="#benefits" className="text-sm font-medium text-muted-foreground hover:text-foreground transition">Benefits</a>
          <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" className="text-primary font-medium">Login</Button>
          </Link>
          <Link href="/dashboard/setup">
            <Button className="bg-primary hover:bg-primary/90 font-medium">Get Started</Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
