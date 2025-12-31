"use client"

import * as React from "react"
import { Switch } from "@ark-ui/react/switch"
import { cn } from "@/lib/utils"

type MnYrSwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}

export function MnYrSwitch({ checked, onCheckedChange, className }: MnYrSwitchProps) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(details) => onCheckedChange(details.checked)}
      className={cn("flex items-center", className)}
    >
      <Switch.Context>
        {(api) => (
          <Switch.Control className="relative inline-flex h-8 w-14 items-center rounded-full bg-blue-500 p-1 shadow-inner transition-colors data-[state=checked]:bg-blue-600 data-focus-visible:ring-2 data-focus-visible:ring-blue-500/40">
            {!api.checked && (
              <span className="absolute left-2 text-[10px] font-semibold text-white">Mn</span>
            )}
            {api.checked && (
              <span className="absolute right-2 text-[10px] font-semibold text-white">Yr</span>
            )}
            <Switch.Thumb className="relative h-6 w-6 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-6" />
          </Switch.Control>
        )}
      </Switch.Context>
      <Switch.HiddenInput />
    </Switch.Root>
  )
}
