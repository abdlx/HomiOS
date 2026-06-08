import { useState } from 'react';
import FileManager from '../components/FileManager';
import ShareManager from '../components/ShareManager';
import { HardDrive, Network } from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'files' | 'shares'>('files');

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white tracking-tight">FileManager</h1>
        </div>

        <div className="p-4 space-y-2 flex-1">
          <button
            onClick={() => setActiveTab('files')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'files' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'
            }`}
          >
            <HardDrive size={18} />
            <span className="font-medium">Files</span>
          </button>
          
          <button
            onClick={() => setActiveTab('shares')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'shares' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'
            }`}
          >
            <Network size={18} />
            <span className="font-medium">SMB Shares</span>
          </button>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button className="w-full py-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white cursor-pointer transition-colors text-sm">
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative shadow-[-5px_0_15px_rgba(0,0,0,0.1)]">
        {activeTab === 'files' ? <FileManager /> : <ShareManager />}
      </div>
    </div>
  );
}
