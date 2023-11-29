import React from 'react'
import { CFooter } from '@coreui/react'

const AppFooter = () => {
  return (
    <CFooter>
      <div>
        Yaanai
      </div>
      <div className="ms-auto">
        Welcome!
      </div>
    </CFooter>
  )
}

export default React.memo(AppFooter)
