"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"

interface ChronoSelectProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  yearRange?: [number, number]
  minDate?: Date
  maxDate?: Date
  disabled?: boolean
  iconOnly?: boolean
  ariaLabel?: string
  title?: string
}

export function ChronoSelect({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  yearRange = [1970, 2050],
  minDate,
  maxDate,
  disabled = false,
  iconOnly = false,
  ariaLabel,
  title,
}: ChronoSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Date | undefined>(value)

  const normalizeDate = React.useCallback((date?: Date) => {
    if (!date) return undefined
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }, [])

  const normalizedMin = React.useMemo(() => normalizeDate(minDate), [minDate, normalizeDate])
  const normalizedMax = React.useMemo(() => normalizeDate(maxDate), [maxDate, normalizeDate])
  const [month, setMonth] = React.useState<Date>(selected ?? normalizedMin ?? new Date())

  const years = React.useMemo(() => {
    const [start, end] = yearRange
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [yearRange])

  const handleSelect = (date: Date | undefined) => {
    setSelected(date)
    setOpen(false)
    onChange?.(date)
  }

  const handleYearChange = (year: string) => {
    const newYear = parseInt(year, 10)
    const newDate = new Date(month)
    newDate.setFullYear(newYear)
    setMonth(newDate)
  }

  React.useEffect(() => {
    setSelected(value)
    if (value) {
      setMonth(value)
    } else if (normalizedMin) {
      setMonth(normalizedMin)
    }
  }, [value, normalizedMin])

  const disabledRange = React.useMemo(() => {
    if (!normalizedMin && !normalizedMax) return undefined
    const range: { before?: Date; after?: Date } = {}
    if (normalizedMin) range.before = normalizedMin
    if (normalizedMax) range.after = normalizedMax
    return range
  }, [normalizedMin, normalizedMax])

  const label = selected ? format(selected, "PPP") : placeholder

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel || label}
          title={title || label}
          className={cn(
            iconOnly
              ? "h-10 w-10 justify-center p-0 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
              : "w-[280px] justify-start text-left font-normal hover:bg-slate-100 hover:text-foreground",
            !selected && !iconOnly && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
          {iconOnly ? <span className="sr-only">{label}</span> : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-2 space-y-2 w-auto">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-medium">{format(month, "MMMM")}</span>
          <Select defaultValue={String(month.getFullYear())} onValueChange={handleYearChange}>
            <SelectTrigger className="h-7 w-[90px] text-xs">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="max-h-48">
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          month={month}
          onMonthChange={setMonth}
          disabled={disabledRange}
          className="rounded-md border"
        />
      </PopoverContent>
    </Popover>
  )
}
