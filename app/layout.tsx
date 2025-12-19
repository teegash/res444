import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/lib/auth/context'
import { MobileNavRoot } from '@/components/navigation/mobile-nav-root'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'RES - Property Management Platform',
  description: 'Complete property management solution for Kenya with M-Pesa integration',
  generator: 'v0.app',
  icons: {
    icon: '/favicon-32x32.png',
    shortcut: '/favicon-32x32.png',
    apple: '/favicon-32x32.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Script id="stash-reset-code" strategy="beforeInteractive">
          {`
            try {
              var u = new URL(window.location.href);
              if (u.pathname === '/auth/reset-password' && u.searchParams.has('code')) {
                var code = u.searchParams.get('code');
                if (code) {
                  // Keep an in-memory fallback in case sessionStorage is blocked.
                  window.__res_reset_code = code;
                  try {
                    sessionStorage.setItem('res_reset_code', code);
                    sessionStorage.setItem('res_reset_code_ts', String(Date.now()));
                  } catch (_) {}
                }
                u.searchParams.delete('code');
                window.history.replaceState({}, '', u.pathname + (u.search ? u.search : '') + u.hash);
              }
            } catch (_) {}
          `}
        </Script>
        <AuthProvider>
          {children}
          <MobileNavRoot />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
