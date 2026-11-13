import { createBrowserRouter, type RouteObject } from 'react-router';
import { LoadingScreen, Shell } from '@/features/shell/Shell';

/** Each page is its own chunk: only the one being viewed is downloaded. */
export const appRoutes: RouteObject[] = [
  {
    element: <Shell />,
    // Shown while the first page chunk downloads.
    HydrateFallback: LoadingScreen,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('@/features/dashboard/DashboardPage')).DashboardPage,
        }),
      },
      {
        path: 'productos',
        lazy: async () => ({
          Component: (await import('@/features/products/ProductsPage')).ProductsPage,
        }),
      },
      {
        path: 'productos/:id',
        lazy: async () => ({
          Component: (await import('@/features/product-detail/ProductDetailPage'))
            .ProductDetailPage,
        }),
      },
      {
        path: 'vencimientos',
        lazy: async () => ({
          Component: (await import('@/features/expiring/ExpiringPage')).ExpiringPage,
        }),
      },
      {
        path: 'compras',
        lazy: async () => ({
          Component: (await import('@/features/purchasing/PurchasingPage')).PurchasingPage,
        }),
      },
      {
        path: 'entrada',
        lazy: async () => ({
          Component: (await import('@/features/receive/ReceivePage')).ReceivePage,
        }),
      },
      {
        path: 'salida',
        lazy: async () => ({
          Component: (await import('@/features/issue/IssuePage')).IssuePage,
        }),
      },
      {
        path: 'ajustes',
        lazy: async () => ({
          Component: (await import('@/features/settings/SettingsPage')).SettingsPage,
        }),
      },
      {
        path: '*',
        lazy: async () => ({
          Component: (await import('@/features/shell/NotFoundPage')).NotFoundPage,
        }),
      },
    ],
  },
];

if (import.meta.env.DEV) {
  appRoutes.push({
    path: '/dev/ui',
    lazy: async () => ({ Component: (await import('@/features/dev/UiGallery')).UiGallery }),
  });
}

export const router = createBrowserRouter(appRoutes);
