import { redirect } from 'next/navigation'

export default function ManagerTenantsRedirectPage() {
  redirect('/dashboard/tenants')
  return null
}
