import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './pages/AuthPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { EditorPage } from './pages/EditorPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToastContainer, useToast } from './components/ui/Toast';
import { Header } from './components/Layout/Header';
import { Loader2 } from 'lucide-react';

function AppShell() {
  const { user, loading, signOut } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

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
