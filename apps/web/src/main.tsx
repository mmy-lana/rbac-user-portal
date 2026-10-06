import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app';
import './styles/app.css';

/**
 * Remote server-state policy.
 *
 *  - `staleTime` 1 minute: session and list data change rarely, and a short
 *    stale window keeps RBAC state from being re-fetched on every navigation.
 *  - `gcTime` 5 minutes: inactive queries stay cached long enough to make
 *    back/forward navigation instant, then release their memory.
 *  - `retry` capped at 2 for idempotent requests only. Non-idempotent calls
 *    (`POST` invitation dispatch, accept, revoke) opt out, because replaying them
 *    could create duplicate or duplicate-revoked records.
 *  - `refetchOnWindowFocus` is off by default and enabled per query where a
 *    stale list would be misleading.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root is missing from index.html.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);