import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './pages/AuthPage';
import { lazy, Suspense } from 'react';
import { ToastContainer, useToast } from './components/ui/Toast';
import { Header } from './components/Layout/Header';
import { Loader2 } from 'lucide-react';

// Pages load on demand: the editor (and its AI/export code) is only
// downloaded when a project is opened.
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const EditorPage = lazy(() => import('./pages/EditorPage').then(m => ({ default: m.EditorPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

function PageLoader() {
  return (
    <div className="flex-1 min-h-[50vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-[#9CA3AF] animate-spin" />
    </div>
  );
}

function AppShell() {
  const { user, loading, signOut } = useAuth();
  const { toasts, removeToast } = useToast();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#9CA3AF] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Routes>
          <Route path="*" element={<AuthPage />} />
        </Routes>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/"
          element={
            <div className="min-h-screen bg-white flex flex-col">
              <Header user={user} onSignOut={signOut} />
              <ProjectsPage user={user} />
            </div>
          }
        />
        <Route path="/editor/:projectId" element={<EditorPage user={user} />} />
        <Route path="/settings" element={<SettingsPage user={user} onSignOut={signOut} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
