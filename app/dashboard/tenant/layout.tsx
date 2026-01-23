import { TenantHeader } from '@/components/dashboard/tenant/tenant-header'

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TenantHeader />
      {children}
    </>
  )
}
