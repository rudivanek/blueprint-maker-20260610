import { Settings, LogOut, ChevronRight, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { HelpModal } from '../ui/HelpModal';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface HeaderProps {
  user: User | null;
  onSignOut: () => void;
  breadcrumbs?: Breadcrumb[];
  rightSlot?: React.ReactNode;
}

export function Header({ user, onSignOut, breadcrumbs, rightSlot }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSettings = location.pathname === '/settings';
  const [showHelp, setShowHelp] = useState(false);

  return (
    <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center px-5 gap-4 shrink-0 z-40">
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 border-2 border-[#2575FC] flex items-center justify-center">
          <span className="text-[#2575FC] text-xs font-bold tracking-tight">S</span>
        </div>
        <span className="text-[#111827] font-semibold text-sm tracking-tight hidden sm:block">Sharpen.Studio</span>
      </Link>

      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-[#9CA3AF] flex-1 min-w-0">
          <ChevronRight className="w-3 h-3 shrink-0" />
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {b.href ? (
                <Link to={b.href} className="hover:text-[#2575FC] transition-colors truncate max-w-[200px]">{b.label}</Link>
              ) : (
                <span className="text-[#111827] truncate max-w-[200px]">{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 shrink-0" />}
            </span>
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">
        {rightSlot}
        <button
          onClick={() => setShowHelp(true)}
          className="w-8 h-8 flex items-center justify-center text-[#9CA3AF] hover:text-[#2575FC] hover:bg-[#F9FAFB] transition-colors"
          title="Help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
        {user && (
          <>
            <button
              onClick={() => navigate('/settings')}
              className={`w-8 h-8 flex items-center justify-center transition-colors ${isSettings ? 'text-[#2575FC] bg-[#F9FAFB]' : 'text-[#9CA3AF] hover:text-[#2575FC] hover:bg-[#F9FAFB]'}`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onSignOut}
              className="w-8 h-8 flex items-center justify-center text-[#9CA3AF] hover:text-[#2575FC] hover:bg-[#F9FAFB] transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </header>
  );
}
