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
  ShieldCheck
} from '@phosphor-icons/react';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const currentRole = user?.role || 'Admin';

  return (
    <aside className="w-64 bg-acc-950 text-acc-100 border-r border-acc-800 flex flex-col justify-between shrink-0 min-h-[calc(100vh-4rem)] text-xs font-sans">
      <div className="p-4 space-y-4">
        
        {/* Header Badge */}
        <div className="px-3 py-2 bg-acc-900 border border-acc-800 rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span className="font-mono text-[10px] font-bold text-acc-200 tracking-wider">STAFF CONTROL PANEL</span>
          </div>
          <span className="badge-pill bg-brand-500 text-acc-950 font-mono text-[9px] font-bold">{currentRole}</span>
        </div>

        <nav className="space-y-1 font-sans">
          
          {/* Main Operations */}
          <div className="px-3 text-[10px] uppercase font-mono tracking-widest text-acc-500 font-semibold pt-1">
            Operations Center
          </div>

          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded font-medium transition-all ${
                isActive
                  ? 'bg-brand-500 text-acc-950 font-extrabold shadow'
                  : 'text-acc-300 hover:bg-acc-850 hover:text-white'
              }`
            }
          >
            <SquaresFour size={16} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/hotels"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded font-medium transition-all ${
                isActive
                  ? 'bg-brand-500 text-acc-950 font-extrabold shadow'
                  : 'text-acc-300 hover:bg-acc-850 hover:text-white'
              }`
            }
          >
            <Buildings size={16} />
            <span>Hotel Branches</span>
          </NavLink>

          <NavLink
            to="/rooms"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded font-medium transition-all ${
                isActive
                  ? 'bg-brand-500 text-acc-950 font-extrabold shadow'
                  : 'text-acc-300 hover:bg-acc-850 hover:text-white'
              }`
            }
          >
            <Bed size={16} />
            <span>Room Inventory</span>
          </NavLink>

          {/* Services & Billing */}
          <div className="px-3 text-[10px] uppercase font-mono tracking-widest text-acc-500 font-semibold pt-3">
            Billing & Services
          </div>

          <NavLink
            to="/services"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded font-medium transition-all ${
                isActive
                  ? 'bg-brand-500 text-acc-950 font-extrabold shadow'
                  : 'text-acc-300 hover:bg-acc-850 hover:text-white'
              }`
            }
          >
            <BellRinging size={16} />
            <span>Service Desk</span>
          </NavLink>

          <NavLink
            to="/billing"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded font-medium transition-all ${
                isActive
                  ? 'bg-brand-500 text-acc-950 font-extrabold shadow'
                  : 'text-acc-300 hover:bg-acc-850 hover:text-white'
              }`
            }
          >
            <Receipt size={16} />
            <span>Billing & Invoices</span>
          </NavLink>

          {/* Administration & Analytics */}
          <div className="px-3 text-[10px] uppercase font-mono tracking-widest text-acc-500 font-semibold pt-3">
            System Admin
          </div>

          {(currentRole === 'Admin' || currentRole === 'Manager') && (
            <NavLink
              to="/employees"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded font-medium transition-all ${
                  isActive
                    ? 'bg-brand-500 text-acc-950 font-extrabold shadow'
                    : 'text-acc-300 hover:bg-acc-850 hover:text-white'
                }`
              }
            >
              <UserGear size={16} />
              <span>Employees</span>
            </NavLink>
          )}

        </nav>
      </div>
    </aside>
  );
};
