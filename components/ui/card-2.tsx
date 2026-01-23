import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export interface ActionItem {
  icon: React.ReactNode
  label: string
  onClick: () => void
  className?: string
}

interface QuickLinksCardProps {
  title: string
  subtitle?: string
  actions: ActionItem[]
  className?: string
}

export const QuickLinksCard = ({
  title,
  subtitle,
  actions,
  className,
}: QuickLinksCardProps) => {
  return (
    <Card className={cn('w-full rounded-2xl', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {actions.map((action, index) => (
            <motion.button
              key={index}
              onClick={action.onClick}
              aria-label={action.label}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className={cn(
                'flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-[10px] font-semibold shadow-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
                action.className
              )}
            >
              <div className="h-6 w-6">{action.icon}</div>
              <span>{action.label}</span>
            </motion.button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
