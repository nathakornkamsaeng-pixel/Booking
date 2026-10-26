import { useAuth } from '@/context/AuthContext';
import { LoginPage } from '@/components/LoginPage';
import { AdminDashboard } from '@/components/AdminDashboard';
import { StudentDashboard } from '@/components/StudentDashboard';
import { ChangePasswordPage } from '@/components/ChangePasswordPage';

function App() {
  const { session, role, mustChangePassword, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
          <p className="text-sm text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (!session) return <LoginPage />;
  if (mustChangePassword) return <ChangePasswordPage />;
  if (role === 'admin') return <AdminDashboard />;
  if (role === 'student') return <StudentDashboard />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-600">
          Your account doesn't have an assigned role yet. Please contact your administrator.
        </p>
      </div>
    </div>
  );
}

export default App;
