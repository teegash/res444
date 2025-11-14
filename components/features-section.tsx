'use client'

import { Building2, Users, CreditCard, Wrench, MessageSquare, BarChart3 } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function FeaturesSection() {
  const features = [
    {
      icon: Building2,
      title: 'Property Management',
      description: 'Manage multiple properties, units, and tenant information with enterprise-grade tools.',
      color: 'bg-blue-500',
    },
    {
      icon: CreditCard,
      title: 'Smart Rent Collection',
      description: 'Automated payment tracking, reminders, and seamless M-Pesa integration.',
      color: 'bg-orange-500',
    },
    {
      icon: Wrench,
      title: 'Maintenance Excellence',
      description: 'Priority-based maintenance requests with real-time tracking and vendor management.',
      color: 'bg-red-500',
    },
    {
      icon: Users,
      title: 'Tenant Relations',
      description: 'Comprehensive tenant profiles, lease management, and communication history.',
      color: 'bg-teal-500',
    },
    {
      icon: MessageSquare,
      title: 'Premium Communication',
      description: 'Integrated messaging system with SMS and email notifications for seamless communication.',
      color: 'bg-purple-500',
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Detailed financial reports, performance metrics, and predictive insights.',
      color: 'bg-indigo-500',
    },
  ]

  return (
    <section id="features" className="w-full py-20 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Premium Features</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need for sophisticated property management
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card key={index} className="p-8 border border-border hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-6`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
