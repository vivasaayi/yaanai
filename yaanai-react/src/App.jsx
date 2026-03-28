import React, { Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './coreui/scss/style.scss'

// New workbench layout
import WorkbenchLayout from './workbench/WorkbenchLayout'

const loading = (
  <div className="pt-3 text-center">
    <div className="sk-spinner sk-spinner-pulse"></div>
  </div>
)

function App() {
  return (
    <HashRouter>
      <Suspense fallback={loading}>
        <Routes>
          <Route path="*" element={<WorkbenchLayout />} />
        </Routes>
      </Suspense>
    </HashRouter>
  )
}

export default App
