import React, { useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Manager from "./pages/Manager";
import Director from "./pages/Director";
import Login from "./components/Login";
import { Badge, Button } from "./components/UI";
import { LayoutGrid, Settings, Users, ShieldCheck, LogOut } from "lucide-react";
import { UserProfile } from "./types";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  props: { children: React.ReactNode };
  state: { error: Error | null };

  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace" }}>
          <h2 style={{ color: "red" }}>アプリエラー</h2>
          <pre
            style={{
              background: "#fee",
              padding: 16,
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => {
              localStorage.clear();
              location.reload();
            }}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              background: "#e55",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ストレージをクリアして再起動
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function NavLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: any;
  label: string;
}) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
        isActive
          ? "bg-slate-200 text-slate-900 shadow-sm border border-slate-300"
          : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </Link>
  );
}

function getPositionLevel(position?: string): number {
  const levels: Record<string, number> = {
    member: 1,
    manager: 2,
    director: 3,
    general_manager: 4,
    executive: 5,
  };
  return (position && levels[position]) || 1;
}

function TopNav({
  user,
  onLogout,
}: {
  user: UserProfile;
  onLogout: () => void;
}) {
  const isAdmin =
    !!user.isAdmin || user.role === "ADMIN" || String(user.id) === "692";
  const canViewManager = isAdmin || getPositionLevel(user.position) >= 2; // 課長以上
  const canViewDirector = isAdmin || getPositionLevel(user.position) >= 4; // 本部長・取締役以上

  return (
    <div className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/80 border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Logo BG Red */}
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="font-bold text-white">W</span>
          </div>
          <div>
            {/* Updated Branding */}
            <h1 className="font-semibold text-slate-800 tracking-tight leading-none">
              Wisteria Group
            </h1>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">
              アンケート エンジン
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <NavLink to="/" icon={LayoutGrid} label="ダッシュボード" />
          {isAdmin && <NavLink to="/admin" icon={Settings} label="管理画面" />}
          {canViewManager && (
            <NavLink to="/manager" icon={Users} label="部長管理" />
          )}
          {canViewDirector && (
            <NavLink to="/director" icon={ShieldCheck} label="取締役管理" />
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:block">
            <Badge color="success">System Online</Badge>
          </div>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-emerald-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const isAdmin = String(user?.id) === "692" || !!user?.isAdmin;
  const canViewManager = isAdmin || getPositionLevel(user.position) >= 2; // 課長（manager）以上
  const canViewDirector = isAdmin || getPositionLevel(user.position) >= 4; // 本部長（general_manager）・取締役（executive）以上

  return (
    <HashRouter>
      <div className="min-h-screen text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
        <TopNav user={user} onLogout={() => setUser(null)} />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route
              path="/admin"
              element={isAdmin ? <Admin /> : <Navigate to="/" />}
            />
            <Route
              path="/manager"
              element={
                canViewManager ? <Manager user={user} /> : <Navigate to="/" />
              }
            />
            <Route
              path="/director"
              element={
                canViewDirector ? <Director user={user} /> : <Navigate to="/" />
              }
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <footer className="border-t border-slate-200 mt-12 py-8 text-center">
          <p className="text-xs text-slate-500">
            アンケート エンジン v1.0.0 <br />
            Powered by Wisteria Group AI Architecture
          </p>
        </footer>
      </div>
    </HashRouter>
  );
}
