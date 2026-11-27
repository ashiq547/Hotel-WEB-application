import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  House,
  SquaresFour,
  Buildings,
  Bed,
  UserGear,
  BellRinging,
  Receipt,
  ShieldCheck,
  Users
} from '@phosphor-icons/react';

/**
 * Role-based menu that mirrors the SERVER permission rules.
 * Hiding a link here is convenience only — the server enforces the real rules.
 */
const MENU_BY_ROLE: Record<string, { to: string; label: string; icon: React.ReactNode }[]> = {
  Guest: [
    { to: '/guest-dashboard', label: 'My Bookings', icon: <SquaresFour size={16} /> },
    { to: '/hotels', label: 'Hotel Branches', icon: <Buildings size={16} /> },
    { to: '/profile', label: 'My Profile', icon: <UserGear size={16} /> }
  ],
  Receptionist: [
    { to: '/hotels', label: 'Hotel Branches', icon: <Buildings size={16} /> },
    { to: '/rooms', label: 'Room Inventory', icon: <Bed size={16} /> },
    { to: '/services', label: 'Service Desk', icon: <BellRinging size={16} /> },
    { to: '/billing', label: 'Billing & Invoices', icon: <Receipt size={16} /> },
    { to: '/profile', label: 'My Profile', icon: <UserGear size={16} /> }
  ],
  Manager: [
    { to: '/dashboard', label: 'Dashboard', icon: <SquaresFour size={16} /> },
    { to: '/hotels', label: 'Hotel Branches', icon: <Buildings size={16} /> },
    { to: '/rooms', label: 'Room Inventory', icon: <Bed size={16} /> },
    { to: '/services', label: 'Service Desk', icon: <BellRinging size={16} /> },
    { to: '/billing', label: 'Billing & Invoices', icon: <Receipt size={16} /> },
    { to: '/employees', label: 'Employees', icon: <UserGear size={16} /> },
    { to: '/profile', label: 'My Profile', icon: <UserGear size={16} /> }
  ],
  Admin: [
    { to: '/dashboard', label: 'Dashboard', icon: <SquaresFour size={16} /> },
    { to: '/hotels', label: 'Hotel Branches', icon: <Buildings size={16} /> },
    { to: '/rooms', label: 'Room Inventory', icon: <Bed size={16} /> },
    { to: '/services', label: 'Service Desk', icon: <BellRinging size={16} /> },
    { to: '/billing', label: 'Billing & Invoices', icon: <Receipt size={16} /> },
    { to: '/employees', label: 'Employees', icon: <UserGear size={16} /> },
    { to: '/users', label: 'User Management', icon: <Users size={16} /> },
    { to: '/profile', label: 'My Profile', icon: <UserGear size={16} /> }
  ]
};

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded font-medium transition-all ${
    isActive
      ? 'bg-brand-500 text-acc-950 font-extrabold shadow'
      : 'text-acc-300 hover:bg-acc-850 hover:text-white'
  }`;

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const currentRole = user?.role || 'Admin';
  const items = MENU_BY_ROLE[currentRole] || MENU_BY_ROLE.Admin;

  return (
    <aside className="w-64 bg-acc-950 text-acc-100 border-r border-acc-800 flex flex-col justify-between shrink-0 min-h-[calc(100vh-4rem)] text-xs font-sans">
      <div className="p-4 space-y-4">
        {/* Header Badge */}
        <div className="px-3 py-2 bg-acc-900 border border-acc-800 rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span className="font-mono text-[10px] font-bold text-acc-200 tracking-wider">
              {currentRole === 'Guest' ? 'GUEST PANEL' : 'STAFF CONTROL PANEL'}
            </span>
          </div>
          <span className="badge-pill bg-brand-500 text-acc-950 font-mono text-[9px] font-bold">{currentRole}</span>
        </div>

        <nav className="space-y-1 font-sans">
          <div className="px-3 text-[10px] uppercase font-mono tracking-widest text-acc-500 font-semibold pt-1">
            {currentRole === 'Guest' ? 'Your Account' : 'Operations Center'}
          </div>

          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={navCls}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
};
