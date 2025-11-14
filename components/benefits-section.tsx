'use client'

import { Card } from '@/components/ui/card'

export function BenefitsSection() {
  const benefits = [
    { stat: '500+', label: 'Properties Managed' },
    { stat: '2,000+', label: 'Happy Tenants' },
    { stat: '99.9%', label: 'Uptime' },
  ]

  return (
    <section id="benefits" className="w-full py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-transparent via-transparent to-black/20" />
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
            <span className="text-xs font-semibold text-white">⭐ Premium Platform ⭐</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Trusted by Kenya's Leading Property Managers
          </h2>
          <p className="text-lg text-white/90 max-w-2xl mx-auto">
            Join hundreds of satisfied property owners who have elevated their rental business with our premium platform.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => (
            <Card key={index} className="p-10 text-center border-0 bg-white/95 backdrop-blur-sm shadow-xl">
              <div className="text-5xl md:text-6xl font-bold bg-gradient-to-br from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">
                {benefit.stat}
              </div>
              <p className="text-muted-foreground font-semibold text-lg">{benefit.label}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
