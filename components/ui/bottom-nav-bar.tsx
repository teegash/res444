"use client"

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type BottomNavItem = {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  onClick?: () => void
}

const MOBILE_LABEL_WIDTH = 58

type BottomNavBarProps = {
  items: BottomNavItem[]
  activeKey?: string
  className?: string
  stickyBottom?: boolean
}

export function BottomNavBar({
  items,
  activeKey,
  className,
  stickyBottom = false,
}: BottomNavBarProps) {
  const router = useRouter()

  return (
    <motion.nav
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      role="navigation"
      aria-label="Bottom Navigation"
      className={cn(
        'bg-card dark:bg-card border border-border dark:border-sidebar-border rounded-full flex items-center p-2 shadow-xl space-x-1 min-w-[320px] max-w-[95vw] h-[52px]',
        stickyBottom && 'fixed inset-x-0 bottom-4 mx-auto z-20 w-fit',
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        const isActive = item.key === activeKey

        return (
          <motion.button
            key={item.key}
            whileTap={{ scale: 0.97 }}
            className={cn(
              'flex items-center gap-0 px-3 py-2 rounded-full transition-colors duration-200 relative h-10 min-w-[44px] min-h-[40px] max-h-[44px]',
              isActive
                ? 'bg-primary/10 dark:bg-primary/15 text-primary dark:text-primary gap-2'
                : 'bg-transparent text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted',
              'focus:outline-none focus-visible:ring-0'
            )}
            onClick={() => {
              if (item.onClick) {
                item.onClick()
                return
              }
              if (item.href) {
                router.push(item.href)
              }
            }}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            type="button"
          >
            <Icon
              className="transition-colors duration-200"
              aria-hidden
              size={22}
              strokeWidth={2}
            />

            <motion.div
              initial={false}
              animate={{
                width: isActive ? `${MOBILE_LABEL_WIDTH}px` : '0px',
                opacity: isActive ? 1 : 0,
                marginLeft: isActive ? '4px' : '0px',
              }}
              transition={{
                width: { type: 'spring', stiffness: 350, damping: 32 },
                opacity: { duration: 0.19 },
                marginLeft: { duration: 0.19 },
              }}
              className={cn('overflow-hidden flex items-center max-w-[72px]')}
            >
              <span
                className={cn(
                  'font-medium text-xs whitespace-nowrap select-none transition-opacity duration-200 overflow-hidden text-ellipsis text-[clamp(0.625rem,0.5263rem+0.5263vw,1rem)] leading-[1.9]',
                  isActive ? 'text-primary dark:text-primary' : 'opacity-0'
                )}
                title={item.label}
              >
                {item.label}
              </span>
            </motion.div>
          </motion.button>
        )
      })}
    </motion.nav>
  )
}

export default BottomNavBar
