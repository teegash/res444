'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Building2, Crown } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="relative w-full py-24 md:py-32 overflow-hidden bg-gradient-to-b from-blue-50/30 via-white to-white">
      <div className="absolute top-20 left-1/2 -translate-x-1/2">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
          <Building2 className="w-12 h-12 text-primary" />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center text-center pt-16">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight text-balance">
          <span className="text-foreground">Premium Rental</span>
          <br />
          <span className="text-primary">Management</span>
          <br />
          <span className="text-accent">Made Elegant</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl text-balance">
          Experience the pinnacle of property management with our sophisticated platform designed for discerning Kenyan landlords and tenants.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Link href="/dashboard">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 gap-2">
              <Crown className="w-5 h-5" />
              Manager Dashboard
            </Button>
          </Link>
          <Link href="/dashboard/tenant">
            <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/5 px-8 h-12">
              Tenant Portal
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
