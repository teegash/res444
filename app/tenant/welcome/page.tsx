export default function TenantWelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="max-w-lg w-full bg-white shadow-lg rounded-2xl p-10 text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Welcome to your tenant portal</h1>
        <p className="text-gray-600">
          Check your email for the login link. Once verified, you will receive credentials to access
          your dashboard.
        </p>
        <p className="text-sm text-muted-foreground">
          This magic link expires in 24 hours. If it expires, contact your property manager to
          resend the invitation.
        </p>
      </div>
    </div>
  )
}
