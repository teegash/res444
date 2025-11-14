import { SignupForm } from '@/components/signup-form'
import { SignupBenefits } from '@/components/signup-benefits'

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-8 max-w-7xl mx-auto">
        {/* Left Column - Form */}
        <div className="flex items-center justify-center p-8 lg:p-12">
          <SignupForm />
        </div>

        {/* Right Column - Benefits */}
        <div className="hidden lg:flex items-center justify-center p-12 bg-secondary">
          <SignupBenefits />
        </div>
      </div>
    </main>
  )
}
