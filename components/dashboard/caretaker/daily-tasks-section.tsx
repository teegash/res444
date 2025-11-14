'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle2 } from 'lucide-react'

const dailyTasks = [
  { id: 1, title: 'Add water bill for month', completed: false },
  { id: 2, title: 'Update maintenance status', completed: false },
  { id: 3, title: 'Send reminders', completed: true },
  { id: 4, title: 'Check payments', completed: false },
]

export function DailyTasksSection() {
  const [tasks, setTasks] = useState(dailyTasks)

  const toggleTask = (id) => {
    setTasks(tasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ))
  }

  const completedCount = tasks.filter(t => t.completed).length
  const totalCount = tasks.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Tasks</CardTitle>
        <CardDescription>
          {completedCount} of {totalCount} completed today
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
              <Checkbox
                checked={task.completed}
                onCheckedChange={() => toggleTask(task.id)}
              />
              <span className={`flex-1 ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </span>
              {task.completed && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
