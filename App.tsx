import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Settings, 
  Upload, 
  FileText,
  Menu,
  X,
  Wifi,
  WifiOff
} from 'lucide-react';
import Employees from './components/Employees';
import AppSettings from './components/Settings';
import ImportData from './components/ImportData';
import ReportView from './components/ReportView';
import { checkApiHealth } from './services/storage';

type View = 'employees' | 'settings' | 'import' | 'reports';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('reports');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const check = async () => {
      const healthy = await checkApiHealth();
      setIsOnline(healthy);
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  const NavItem = ({ view, icon: Icon, label }: { view: View; icon: any; label: string }) => (
    <button
      onClick={() => { setCurrentView(view); setIsSidebarOpen(false); }}
      className={`flex items-center space-x-3 w-full p-3 rounded-lg transition-colors ${
        currentView === view 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        no-print
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-700">MeineSpesen</h1>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-gray-500">
              <X size={24} />
            </button>
          </div>
          
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <NavItem view="reports" icon={FileText} label="Spesenabrechnung" />
            <NavItem view="import" icon={Upload} label="Datenimport" />
            <NavItem view="employees" icon={Users} label="Mitarbeiter" />
            <div className="pt-4 mt-4 border-t border-gray-100">
              <NavItem view="settings" icon={Settings} label="Einstellungen" />
            </div>
          </nav>

          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span>v1.0.0</span>
              <span>&bull;</span>
              <span className={`flex items-center gap-1 ${isOnline ? 'text-green-600' : 'text-orange-500'}`}>
                {isOnline ? <Wifi size={12}/> : <WifiOff size={12}/>}
                {isOnline ? 'Server Online' : 'Offline Mode'}
              </span>
            </div>
            {isOnline && <div className="text-[10px] text-gray-300">Datenbank verbunden</div>}
            {!isOnline && <div className="text-[10px] text-orange-300">Daten werden lokal gespeichert</div>}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white lg:bg-gray-50">
        {/* Mobile Header */}
        <header className="bg-white border-b border-gray-200 p-4 flex items-center lg:hidden no-print">
          <button onClick={() => setIsSidebarOpen(true)} className="text-gray-600 mr-4">
            <Menu size={24} />
          </button>
          <span className="font-semibold text-lg text-gray-800 capitalize">{currentView}</span>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {currentView === 'reports' && <ReportView />}
            {currentView === 'import' && <ImportData />}
            {currentView === 'employees' && <Employees />}
            {currentView === 'settings' && <AppSettings />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;