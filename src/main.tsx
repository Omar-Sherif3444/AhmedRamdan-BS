import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

// Two separate bundles behind one URL. The public wait board (#/) must stay inside its budget, so it
// never loads the store, supabase-js, i18n, the admin styles or three.js; staff routes load all of that.
const Public = lazy(() => import('./pages/Public'))
const Staff = lazy(() => import('./Staff'))

const isPublic = () => /^#?\/?$/.test(location.hash)

function Root() {
  const [pub, setPub] = useState(isPublic)
  useEffect(() => {
    const on = () => setPub(isPublic())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return <Suspense fallback={null}>{pub ? <Public /> : <Staff />}</Suspense>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
