import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { GuestLoginPage } from './pages/GuestLoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { HotelsPage } from './pages/HotelsPage';
import { RoomsPage } from './pages/RoomsPage';
import { ServicesPage } from './pages/ServicesPage';
import { BillingPage } from './pages/BillingPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { GuestDashboardPage } from './pages/GuestDashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { UserManagementPage } from './pages/UserManagementPage';

/**
 * Route guards mirror the server RBAC rules. The server is authoritative;
 * these guards just avoid sending users to pages they cannot use.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { token, user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="font-mono text-xs text-acc-500 animate-pulse">Restoring session…</div>
      </div>
    );
  }
  if (!token) return <Navigate to="/guest-login" replace />;
  if (roles && (!user || !roles.includes(user.role))) {
    // Server would 403 — send the user somewhere they belong instead.
    return <Navigate to={user?.role === 'Guest' ? '/guest-dashboard' : '/dashboard'} replace />;
  }
  return <>{children}</>;
};

const StaffDashboardGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user?.role === 'Guest') {
    return <Navigate to="/guest-dashboard" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Main App Layout with Persistent Navbar */}
          <Route path="/" element={<Layout />}>
            
            {/* Public Customer & Guest Routes */}
            <Route index element={<HomePage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="guest-login" element={<GuestLoginPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="hotels" element={<HotelsPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="guest-dashboard" element={<ProtectedRoute roles={['Guest']}><GuestDashboardPage /></ProtectedRoute>} />

            {/* Protected Management & Admin Operations — role lists match the server */}
            <Route path="dashboard" element={<ProtectedRoute roles={['Admin', 'Manager', 'Receptionist']}><DashboardPage /></ProtectedRoute>} />
            <Route path="services" element={<ProtectedRoute roles={['Admin', 'Manager', 'Receptionist']}><ServicesPage /></ProtectedRoute>} />
            <Route path="billing" element={<ProtectedRoute roles={['Admin', 'Manager', 'Receptionist']}><BillingPage /></ProtectedRoute>} />
            <Route path="employees" element={<ProtectedRoute roles={['Admin', 'Manager']}><EmployeesPage /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute roles={['Admin', 'Manager', 'Receptionist']}><ReportsPage /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute roles={['Admin', 'Manager']}><SettingsPage /></ProtectedRoute>} />
            <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

            {/* Admin-only: server enforces user:read:all etc. */}
            <Route path="users" element={<ProtectedRoute roles={['Admin']}><UserManagementPage /></ProtectedRoute>} />
          </Route>

          {/* Catch-all fallback always redirects to Home Page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
