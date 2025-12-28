"use client"

import * as React from "react"
import { TimePicker } from "@/components/ui/time-picker"

export default function TimePickerDemo() {
  const [time, setTime] = React.useState<string>()

  return <TimePicker value={time} onChange={setTime} />
}
