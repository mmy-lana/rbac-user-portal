import * as React from 'react';
import { AppRouter } from './routes/router';
import { VaultErrorBoundary } from './components/error/vault-error-boundary';
import { useApiClientBridge, useSessionBootstrap } from './features/auth/hooks/use-auth';

/**
 * Application root.
 *
 * Owns the two session-level effects that must exist above the router — the HTTP
 * client bridge and the bootstrap refresh — and wraps the tree in the root error
 * boundary so a render fault outside the routed content still yields a recovery
 * screen instead of a blank page.
 */
export const App: React.FC = () => {
  useApiClientBridge();
  useSessionBootstrap();

  return (
    <VaultErrorBoundary scope="Application">
      <AppRouter />
    </VaultErrorBoundary>
  );
};
App.displayName = 'App';