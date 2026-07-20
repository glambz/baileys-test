import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/router';
import { queryClient } from '@/lib/queryClient';
import { hydrateUiFromStorage } from '@/stores/ui';
import { installMockInterceptor } from '@/mock/interceptor';
import '@/index.css';

// Install the mock fetch interceptor BEFORE the React tree mounts so
// every component sees the mock data on the very first paint.
installMockInterceptor();
hydrateUiFromStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);