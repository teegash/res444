import { StatementsAtGlanceGrid } from "@/components/manager/StatementsAtGlanceGrid"
import Sidebar from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"

export default function ManagerStatementsPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Statements" />
        <div className="p-6 space-y-4">
          <h1 className="text-xl font-semibold">Statements</h1>
          <p className="text-sm text-gray-600">
            Tenant balances, arrears, and quick access to full statements.
          </p>
          <StatementsAtGlanceGrid />
        </div>
      </div>
    </div>
  )
}

