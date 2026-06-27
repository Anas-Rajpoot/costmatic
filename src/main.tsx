import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { get, set, del } from 'idb-keyval'
import App from './App'
import { AuthProvider } from './features/auth/AuthContext'
import { SyncProvider } from './lib/SyncContext'
import { queryClient } from './lib/queryClient'
import './lib/i18n'
import './index.css'

const persister = createAsyncStoragePersister({
  storage: {
    getItem:    key          => get(key),
    setItem:    (key, value) => set(key, value),
    removeItem: key          => del(key),
  },
  key: 'costmatic_query_cache',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24 * 7,
          // Bump this when cached data shape/semantics change — it discards any
          // older persisted cache on load so users never get stuck on stale data.
          buster: 'costmatic-2026-06-26',
        }}
      >
        <SyncProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </SyncProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
