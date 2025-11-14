'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check } from 'lucide-react'

export function PricingSection() {
  const tiers = [
    {
      name: 'Starter',
      price: 'KES 2,999',
      period: '/month',
      description: 'Perfect for new property managers',
      features: [
        'Up to 5 properties',
        'Basic tenant management',
        'Payment tracking',
        'Email support',
        'Mobile app access',
      ],
      cta: 'Start Free Trial',
      highlighted: false,
    },
    {
      name: 'Professional',
      price: 'KES 7,999',
      period: '/month',
      description: 'Most popular for growing portfolios',
      features: [
        'Up to 50 properties',
        'Advanced tenant management',
        'M-Pesa integration',
        'Automated reminders',
        'Priority support',
        'Custom reports',
        'Maintenance tracking',
      ],
      cta: 'Start Free Trial',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: 'pricing',
      description: 'For large portfolios and teams',
      features: [
        'Unlimited properties',
        'Multi-user management',
        'Advanced M-Pesa integration',
        'API access',
        'Dedicated support',
        'Custom integrations',
        'Analytics & reporting',
      ],
      cta: 'Contact Sales',
      highlighted: false,
    },
  ]

  return (
    <section id="pricing" className="w-full py-20 md:py-32 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Simple, Transparent Pricing</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the perfect plan for your property management needs
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier, index) => (
            <Card
              key={index}
              className={`p-8 border transition-all ${
                tier.highlighted
                  ? 'border-primary shadow-xl scale-105 md:scale-100'
                  : 'border-gray-200'
              }`}
            >
              {tier.highlighted && (
                <div className="mb-4">
                  <span className="inline-block bg-accent text-white px-3 py-1 rounded-full text-xs font-semibold">
                    Most Popular
                  </span>
                </div>
              )}
              <h3 className="text-2xl font-bold text-foreground mb-2">{tier.name}</h3>
              <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>
              
              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                <span className="text-muted-foreground ml-2">{tier.period}</span>
              </div>

              <Button
                className={`w-full mb-8 ${
                  tier.highlighted
                    ? 'bg-primary hover:bg-primary/90 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-foreground'
                }`}
              >
                {tier.cta}
              </Button>

              <div className="space-y-4">
                {tier.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
