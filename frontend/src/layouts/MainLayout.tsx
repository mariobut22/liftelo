import React from 'react'

interface Props {
  children: React.ReactNode
}

function MainLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-gray-100 min-w-0 overflow-x-hidden">
      <div className="flex min-w-0 overflow-x-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-md p-6">
          <h2 className="text-xl font-bold">Liftelo</h2>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout
