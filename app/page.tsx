import { Header } from '@/components/header'
import { HeroSection } from '@/components/hero-section'
import { FeaturesSection } from '@/components/features-section'
import { BenefitsSection } from '@/components/benefits-section'
import { Footer } from '@/components/footer'

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <BenefitsSection />
      <Footer />
    </main>
  )
}
