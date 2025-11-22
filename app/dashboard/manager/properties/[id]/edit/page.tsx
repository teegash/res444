import { redirect } from 'next/navigation'

interface Props {
  params: { id: string }
}

export default function ManagerPropertyEditRedirect({ params }: Props) {
  const target = params?.id ? `/dashboard/properties/${params.id}/edit` : '/dashboard/properties'
  redirect(target)
  return null
}
