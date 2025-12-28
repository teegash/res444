import { Header } from '@/components/header'
import { BackgroundPaths } from '@/components/ui/background-paths'
import { FeaturesSection } from '@/components/features-section'
import { BenefitsSection } from '@/components/benefits-section'
import { Footer } from '@/components/footer'

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <BackgroundPaths
        title="Premium Rental Management"
        subtitle="A clear view of maintenance, payments, and tenant care in one place"
      />
      <FeaturesSection />
      <BenefitsSection />
      <Footer />
    </main>
  )
}
