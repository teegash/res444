import { redirect } from 'next/navigation'

export default function ManagerPropertiesRedirect() {
  redirect('/dashboard/properties')
  return null
}
