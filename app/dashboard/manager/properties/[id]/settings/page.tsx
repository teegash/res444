import { redirect } from 'next/navigation'

interface Props {
  params: { id: string }
}

export default function ManagerPropertySettingsRedirect({ params }: Props) {
  const target = params?.id ? `/dashboard/properties/${params.id}` : '/dashboard/properties'
  redirect(target)
  return null
}
