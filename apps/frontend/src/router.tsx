import * as React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonPage } from '@/components/layout/SkeletonPage';

const ChatsPage = lazy(() => import('@/pages/ChatsPage'));
const AiChatPage = lazy(() => import('@/pages/AiChatPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const CrmWorkspacePage = lazy(() => import('@/pages/CrmWorkspacePage'));
const CrmSchemaDesignerPage = lazy(() => import('@/pages/CrmSchemaDesignerPage'));
const CrmKnowledgePage = lazy(() => import('@/pages/CrmKnowledgePage'));
const CrmDataViewerPage = lazy(() => import('@/pages/CrmDataViewerPage'));
const CrmRecordDetailPage = lazy(() => import('@/pages/CrmRecordDetailPage'));
const AiWorkspacePage = lazy(() => import('@/pages/AiWorkspacePage'));
const AiSettingsPage = lazy(() => import('@/pages/AiSettingsPage'));
const AuthInitPage = lazy(() => import('@/pages/AuthInitPage'));
const QrScanPage = lazy(() => import('@/pages/QrScanPage'));
const WhatsAppConnectionPage = lazy(() => import('@/pages/WhatsAppConnectionPage'));

const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<SkeletonPage />}>
    <Component />
  </Suspense>
);

/**
 * Route map.
 * - WhatsApp module (preserved): `/chats`, `/chats/:chatId`, `/ai-chat`.
 * - CRM module (new): `/crm`, `/crm/_schema`, `/crm/_knowledge`,
 *   `/crm/:entityName`, `/crm/:entityName/:recordId`.
 * - AI team-scope (new): `/ai`; `/ai-chat` continues to resolve.
 *
 * Layout routes (`AppShell`) wrap the page routes.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/chats" replace /> },
      // WhatsApp module (locked)
      { path: 'chats', element: withSuspense(ChatsPage) },
      { path: 'chats/:chatId', element: withSuspense(ChatsPage) },
      { path: 'ai-chat', element: withSuspense(AiChatPage) },
      // CRM module
      { path: 'crm', element: withSuspense(CrmWorkspacePage) },
      { path: 'crm/_schema', element: withSuspense(CrmSchemaDesignerPage) },
      { path: 'crm/_knowledge', element: withSuspense(CrmKnowledgePage) },
      { path: 'crm/:entityName', element: withSuspense(CrmDataViewerPage) },
      { path: 'crm/:entityName/:recordId', element: withSuspense(CrmRecordDetailPage) },
      // AI workspace (team scope)
      { path: 'ai', element: withSuspense(AiWorkspacePage) },
      // WhatsApp connection control panel (manual init / QR / status).
      // Distinct from the /qr onboarding flow, which auto-polls and
      // redirects; this one does exactly what the operator clicks.
      { path: 'whatsapp-connection', element: withSuspense(WhatsAppConnectionPage) },
      // AI Settings (per-tenant configuration; full-width, single column)
      { path: 'ai-settings', element: withSuspense(AiSettingsPage) },
      // Auth flow (standalone pages — work even before the main app's
      // auth gate resolves).
      { path: 'auth-init', element: withSuspense(AuthInitPage) },
      { path: 'qr', element: withSuspense(QrScanPage) },
      // Catch-all
      { path: '*', element: withSuspense(NotFoundPage) },
    ],
  },
]);
