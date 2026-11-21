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

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (!token) return <Navigate to="/guest-login" replace />;
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
            <Route path="guest-dashboard" element={<ProtectedRoute><GuestDashboardPage /></ProtectedRoute>} />

            {/* Protected Management & Admin Operations */}
            <Route path="dashboard" element={<ProtectedRoute><StaffDashboardGuard><DashboardPage /></StaffDashboardGuard></ProtectedRoute>} />
            <Route path="services" element={<ProtectedRoute><ServicesPage /></ProtectedRoute>} />
            <Route path="billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
            <Route path="employees" element={<ProtectedRoute><EmployeesPage /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          </Route>

          {/* Catch-all fallback always redirects to Home Page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
