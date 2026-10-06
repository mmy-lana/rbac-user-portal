import * as React from 'react';
import { AppRouter } from './routes/router';
import { useApiClientBridge, useSessionBootstrap } from './features/auth/hooks/use-auth';

/**
 * Application root.
 *
 * Owns the two session-level effects that must exist above the router:
 *  - the HTTP client bridge, so any request can reach the in-memory token; and
 *  - the bootstrap refresh that re-establishes a session after a reload.
 */
export const App: React.FC = () => {
  useApiClientBridge();
  useSessionBootstrap();

  return <AppRouter />;
};
App.displayName = 'App';