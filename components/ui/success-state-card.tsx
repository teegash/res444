import { ReactNode } from 'react'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type SuccessDetail = {
  label: string
  value: string
}

type SuccessStateCardProps = {
  title: string
  description?: string
  badge?: string
  details?: SuccessDetail[]
  onBack?: () => void
  actions?: ReactNode
}

export function SuccessStateCard({
  title,
  description,
  badge,
  details,
  onBack,
  actions,
}: SuccessStateCardProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <Card className="border-0 shadow-xl bg-white/90 backdrop-blur">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            {onBack ? (
              <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <div className="h-9 w-9" />
            )}
            {badge ? <Badge variant="secondary">{badge}</Badge> : null}
          </div>
          <div className="mt-4 flex flex-col items-center text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            {details?.length ? (
              <div className="mt-4 grid w-full gap-3 sm:grid-cols-2 text-left">
                {details.map((detail) => (
                  <div key={detail.label} className="rounded-lg border bg-slate-50/70 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{detail.label}</p>
                    <p className="text-sm font-medium text-slate-900">{detail.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {actions ? <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
