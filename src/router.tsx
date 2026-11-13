import { createBrowserRouter, type RouteObject } from 'react-router';

const routes: RouteObject[] = [{ path: '/', element: <h1>Mi-lab</h1> }];

if (import.meta.env.DEV) {
  routes.push({
    path: '/dev/ui',
    lazy: async () => ({ Component: (await import('@/features/dev/UiGallery')).UiGallery }),
  });
}

export const router = createBrowserRouter(routes);
