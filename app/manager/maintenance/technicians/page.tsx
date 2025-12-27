import { redirect } from 'next/navigation'

export default function ManagerTechniciansRedirect() {
  redirect('/dashboard/maintenance/technicians')
}
