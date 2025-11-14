'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'

const BENEFIT_DATA = {
  owner: [
    {
      title: 'Easy Property Management',
      description: 'Manage all your rental properties from one dashboard with automated rent collection via M-Pesa.',
      icon: '📊',
    },
    {
      title: 'Instant Payments',
      description: 'Receive rent payments directly to your mobile money account with real-time notifications.',
      icon: '💰',
    },
    {
      title: 'Tenant Management',
      description: 'Screen tenants, maintain records, and manage maintenance requests effortlessly.',
      icon: '👥',
    },
  ],
  manager: [
    {
      title: 'Complete Control',
      description: 'Oversee property operations, tenant communications, and maintenance workflows.',
      icon: '🎯',
    },
    {
      title: 'Performance Analytics',
      description: 'Track occupancy rates, maintenance costs, and revenue metrics in real-time.',
      icon: '📈',
    },
    {
      title: 'Team Collaboration',
      description: 'Coordinate with caretakers and property owners with built-in messaging.',
      icon: '🤝',
    },
  ],
  caretaker: [
    {
      title: 'Daily Tasks',
      description: 'Receive and complete maintenance requests with photo evidence and timestamps.',
      icon: '✓',
    },
    {
      title: 'Tenant Communication',
      description: 'Direct messaging with tenants and property managers for quick resolutions.',
      icon: '💬',
    },
    {
      title: 'Income Tracking',
      description: 'Track your earnings from maintenance work and tips directly on your phone.',
      icon: '📱',
    },
  ],
  tenant: [
    {
      title: 'Easy Rent Payment',
      description: 'Pay rent anytime using M-Pesa with instant confirmation and receipt.',
      icon: '💳',
    },
    {
      title: 'Request Maintenance',
      description: 'Submit maintenance requests and track status until completion.',
      icon: '🔧',
    },
    {
      title: 'Lease Management',
      description: 'Access your lease agreement, payment history, and important documents in one place.',
      icon: '📄',
    },
  ],
}

const TESTIMONIALS = {
  owner: {
    text: 'RentalKenya has transformed how I manage my 5 properties. The M-Pesa integration is seamless!',
    author: 'Mary Wanjiru',
    title: 'Property Owner',
  },
  manager: {
    text: 'Managing multiple properties used to be a nightmare. Now everything is organized and efficient.',
    author: 'David Kipchoge',
    title: 'Property Manager',
  },
  caretaker: {
    text: 'I can now track all maintenance requests and get paid instantly for my work.',
    author: 'James Mutua',
    title: 'Caretaker',
  },
  tenant: {
    text: 'Paying rent with M-Pesa has never been easier. I love the instant confirmations!',
    author: 'Sarah Omondi',
    title: 'Tenant',
  },
}

export function SignupBenefits() {
  const [userType, setUserType] = useState<'owner' | 'manager' | 'caretaker' | 'tenant'>('owner')

  const benefits = BENEFIT_DATA[userType]
  const testimonial = TESTIMONIALS[userType]

  return (
    <div className="w-full max-w-md space-y-8">
      {/* User Type Selector */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-secondary-foreground">For you as a</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(BENEFIT_DATA).map(type => (
            <button
              key={type}
              onClick={() => setUserType(type as 'owner' | 'manager' | 'caretaker' | 'tenant')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                userType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/10 text-secondary-foreground hover:bg-white/20'
              }`}
            >
              {type === 'owner' ? 'Owner' : type === 'manager' ? 'Manager' : type === 'caretaker' ? 'Caretaker' : 'Tenant'}
            </button>
          ))}
        </div>
      </div>

      {/* Benefits Cards */}
      <div className="space-y-3">
        {benefits.map((benefit, index) => (
          <Card key={index} className="p-4 bg-white/5 border border-white/10 backdrop-blur">
            <div className="flex gap-3">
              <span className="text-2xl">{benefit.icon}</span>
              <div>
                <h3 className="font-semibold text-secondary-foreground text-sm mb-1">{benefit.title}</h3>
                <p className="text-xs text-secondary-foreground/80">{benefit.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Testimonial */}
      <Card className="p-5 bg-white/10 border border-white/20 backdrop-blur">
        <p className="text-sm italic text-secondary-foreground mb-4">"{testimonial.text}"</p>
        <div className="pt-3 border-t border-white/10">
          <p className="font-semibold text-sm text-secondary-foreground">{testimonial.author}</p>
          <p className="text-xs text-secondary-foreground/70">{testimonial.title}</p>
        </div>
      </Card>
    </div>
  )
}
