import { redirect } from 'next/navigation'

export default function ManagerPropertiesNewRedirect() {
  redirect('/dashboard/properties/new')
  return null
}
