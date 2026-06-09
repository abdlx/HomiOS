import React, { useState, useEffect, useRef } from 'react';
import { Box, Play, Square, Terminal, Plus, Trash, Server, X, Activity, ChevronRight, Layers, LayoutGrid } from 'lucide-react';
import io from 'socket.io-client';

interface AppProps {
  onClose: () => void;
  initialAppId?: string | null;
}

export default function DockerManagerApp({ onClose, initialAppId }: AppProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');
  
  const [showWizard, setShowWizard] = useState(false);
  const [newApp, setNewApp] = useState({ name: '', build_pack: 'dockerimage', docker_image: '', docker_image_tag: 'latest', compose_content: '', ports: '', env_vars: '' });
  
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchApps(selectedProject.id);
      setSelectedApp(null);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (initialAppId) {
       fetch('/api/docker/apps')
         .then(res => res.json())
         .then(data => {
            if (Array.isArray(data)) {
               const app = data.find(a => a.id === initialAppId);
               if (app) {
                 const proj = projects.find(p => p.id === app.project_id);
                 if (proj) setSelectedProject(proj);
                 setSelectedApp(app);
               }
            }
         });
    }
  }, [initialAppId, projects.length]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/docker/projects');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
        if (!selectedProject && data.length > 0 && !initialAppId) setSelectedProject(data[0]);
      } else {
        setProjects([]);
      }
    } catch (err) {
      setProjects([]);
    }
  };

  const fetchApps = async (projectId: string) => {
    try {
      const res = await fetch(`/api/docker/projects/${projectId}/apps`);
      const data = await res.json();
      if (Array.isArray(data)) setApps(data);
      else setApps([]);
    } catch (err) {
      setApps([]);
    }
  };

  const handleCreateProject = async () => {
    const name = prompt('New Project Name:');
    if (!name) return;
    await fetch('/api/docker/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: '' })
    });
    fetchProjects();
  };

  const handleDeployApp = async () => {
    if (!selectedProject) return;
    const res = await fetch(`/api/docker/projects/${selectedProject.id}/apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newApp,
        ports: newApp.ports ? JSON.stringify([{ host: newApp.ports.split(':')[0], container: newApp.ports.split(':')[1] || newApp.ports.split(':')[0] }]) : '',
        env_vars: newApp.env_vars ? JSON.stringify(Object.fromEntries(newApp.env_vars.split(',').map(kv => kv.split('=')))) : ''
      })
    });
    const createdApp = await res.json();
    setShowWizard(false);
    fetchApps(selectedProject.id);
    setSelectedApp(createdApp);
    setActiveTab('logs');
    startDeployment(createdApp.id);
  };

  const startDeployment = async (appId: string) => {
    setLiveLogs(['Initializing deployment...']);
    setActiveTab('logs');
    setSelectedApp((prev: any) => prev ? { ...prev, status: 'deploying' } : null);

    const res = await fetch(`/api/docker/apps/${appId}/deploy`, { method: 'POST' });
    const data = await res.json();
    
    if (selectedProject) fetchApps(selectedProject.id);

    if (data.deploymentId) {
      const socket = io();
      socket.emit('join_deployment', data.deploymentId);
      socket.on('log', (line) => {
        setLiveLogs(prev => [...prev, line]);
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };

  const stopApp = async (appId: string) => {
    await fetch(`/api/docker/apps/${appId}/stop`, { method: 'POST' });
    if (selectedProject) fetchApps(selectedProject.id);
    if (selectedApp) setSelectedApp({...selectedApp, status: 'stopped'});
  };

  const deleteApp = async (appId: string) => {
    if (!confirm('Are you sure you want to delete this resource? This action cannot be undone.')) return;
    await fetch(`/api/docker/apps/${appId}`, { method: 'DELETE' });
    if (selectedProject) fetchApps(selectedProject.id);
    setSelectedApp(null);
  };

  return (
    <div className="h-full w-full flex bg-gray-50 select-none overflow-hidden font-sans">
      
      {/* Floating Apple-Style Sidebar */}
      <div className="hidden md:flex flex-col justify-between w-[240px] md:w-[250px] bg-white border border-neutral-200/50 shadow-sm m-3 rounded-[32px] p-4 pt-5">
        <div className="flex flex-col h-full">
          {/* macOS Window Controls */}
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" 
                title="Close" 
                onClick={onClose}
              />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
            </div>
          </div>

          <div className="mb-2 px-2 flex justify-between items-center">
            <span className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">Projects</span>
            <button onClick={handleCreateProject} className="text-gray-400 hover:text-blue-500 transition-colors">
              <Plus size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {projects.map(p => {
              const isActive = selectedProject?.id === p.id;
              return (
                <button 
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors font-medium
                    ${isActive 
                      ? 'bg-blue-600/10 text-blue-600 font-bold' 
                      : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                    }`}
                >
                  <Layers size={16} className={`flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="truncate flex-1">{p.name}</span>
                </button>
              );
            })}
            {projects.length === 0 && (
              <div className="text-center py-6 text-xs text-gray-400 italic">No projects found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 pt-3 pr-3 pb-3">
        {selectedProject ? (
          selectedApp ? (
            // ── App Details View ──
            <div className="flex flex-col h-full bg-white rounded-[32px] border border-neutral-200/50 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start">
                <div>
                  <button onClick={() => setSelectedApp(null)} className="flex items-center text-xs font-medium text-gray-400 hover:text-blue-500 mb-3 transition-colors">
                     ← Back to {selectedProject.name}
                  </button>
                  <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    {selectedApp.name}
                    <span className={`ml-3 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider 
                      ${selectedApp.status === 'running' ? 'bg-green-100 text-green-700' : 
                        selectedApp.status === 'deploying' ? 'bg-amber-100 text-amber-700' : 
                        selectedApp.status === 'error' ? 'bg-red-100 text-red-700' : 
                        'bg-gray-100 text-gray-600'}`}>
                      {selectedApp.status}
                    </span>
                  </h1>
                  <p className="text-sm text-gray-500 mt-1 flex items-center">
                    <Box size={14} className="mr-1.5 opacity-70"/> {selectedApp.build_pack === 'dockerimage' ? `${selectedApp.docker_image}:${selectedApp.docker_image_tag}` : 'Docker Compose'}
                  </p>
                </div>
                <div className="flex space-x-3">
                  {selectedApp.status === 'running' ? (
                    <button onClick={() => stopApp(selectedApp.id)} className="px-4 py-2 bg-white hover:bg-neutral-50 text-gray-700 text-sm font-medium rounded-[10px] transition border border-neutral-200 flex items-center shadow-sm">
                      <Square size={14} className="mr-2 text-red-500" /> Stop
                    </button>
                  ) : (
                    <button onClick={() => startDeployment(selectedApp.id)} className="px-4 py-2 bg-[#007aff] hover:bg-[#0062cc] text-white text-sm font-medium rounded-[10px] transition shadow-sm flex items-center">
                      <Play size={14} className="mr-2 fill-current" /> Deploy
                    </button>
                  )}
                </div>
              </div>

              <div className="px-8 border-b border-neutral-100 flex space-x-6">
                {['config', 'logs'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab ? 'border-[#007aff] text-[#007aff]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
                {activeTab === 'config' && (
                  <div className="max-w-3xl space-y-8">
                    <section className="bg-white p-6 rounded-[20px] border border-neutral-200/60 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-5">Configuration</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Ports (Host:Container)</label>
                          <input type="text" readOnly value={selectedApp.ports || 'None'} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-2.5 text-sm text-gray-800 focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Environment Variables</label>
                          <textarea readOnly value={selectedApp.env_vars || 'None'} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-2.5 text-sm text-gray-800 font-mono h-24 focus:outline-none" />
                        </div>
                        {selectedApp.build_pack === 'dockercompose' && (
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">docker-compose.yml</label>
                            <textarea readOnly value={selectedApp.compose_content || ''} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-2.5 text-sm text-gray-800 font-mono h-48 focus:outline-none" />
                          </div>
                        )}
                      </div>
                    </section>
                    <section className="p-6 rounded-[20px] border border-red-200 bg-red-50">
                      <h3 className="text-lg font-bold text-red-600 mb-2">Danger Zone</h3>
                      <p className="text-sm text-red-500/80 mb-4">Permanently delete this resource and all of its data. This cannot be undone.</p>
                      <button onClick={() => deleteApp(selectedApp.id)} className="px-4 py-2 bg-white hover:bg-red-100 text-red-600 border border-red-200 text-sm font-medium rounded-[10px] transition shadow-sm flex items-center">
                        <Trash size={14} className="mr-2" /> Delete Resource
                      </button>
                    </section>
                  </div>
                )}
                {activeTab === 'logs' && (
                  <div className="h-full flex flex-col bg-gray-900 rounded-[20px] shadow-inner overflow-hidden">
                    <div className="bg-gray-800 px-4 py-2 flex justify-between items-center border-b border-gray-700">
                      <span className="text-xs font-mono text-gray-400 flex items-center"><Terminal size={12} className="mr-2"/> output.log</span>
                      <button onClick={() => setLiveLogs([])} className="text-xs text-gray-500 hover:text-white transition">Clear</button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm leading-relaxed text-green-400">
                      {liveLogs.length === 0 ? (
                         <div className="text-gray-500 italic">No active logs.</div>
                      ) : (
                        liveLogs.map((log, i) => <div key={i} className="break-all">{log}</div>)
                      )}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // ── Project Dashboard ──
            <div className="flex flex-col h-full bg-white rounded-[32px] border border-neutral-200/50 shadow-sm overflow-hidden relative">
              {/* Header / Toolbar */}
              <div className="px-8 py-8 border-b border-neutral-100 flex justify-between items-end bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-1">{selectedProject.name}</h1>
                  <p className="text-gray-500 font-medium text-sm">Manage resources and containers for this project.</p>
                </div>
                <button 
                  onClick={() => setShowWizard(true)}
                  className="px-5 py-2 bg-[#007aff] hover:bg-[#0062cc] text-white font-medium rounded-[10px] transition shadow-sm flex items-center text-sm"
                >
                  <Plus size={16} className="mr-1.5" /> Add Resource
                </button>
              </div>

              {/* Grid Area */}
              <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
                {apps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
                    <div className="w-16 h-16 bg-white border border-neutral-200 rounded-full flex items-center justify-center mb-4 shadow-sm">
                      <LayoutGrid size={28} className="text-[#007aff]" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No resources found</h3>
                    <p className="text-sm text-gray-500 mb-6">You haven't deployed any applications to this project yet. Start by adding a Docker container or Compose stack.</p>
                    <button onClick={() => setShowWizard(true)} className="px-5 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-gray-800 font-bold rounded-[12px] transition shadow-sm">
                      Add your first resource
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {apps.map(app => (
                      <div 
                        key={app.id} 
                        onClick={() => setSelectedApp(app)}
                        className="bg-white rounded-[20px] border border-neutral-200/60 p-5 cursor-pointer hover:border-[#007aff]/30 transition-all hover:shadow-md group flex flex-col h-44"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center space-x-3">
                            <div className={`p-2.5 rounded-[12px] ${app.status === 'running' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                              <Box size={20} />
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-gray-900 group-hover:text-[#007aff] transition-colors truncate max-w-[140px]">{app.name}</h3>
                              <p className="text-xs text-gray-500 font-medium">{app.build_pack}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            {app.status === 'running' && <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" title="Running"/>}
                            {app.status === 'deploying' && <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" title="Deploying"/>}
                            {app.status === 'error' && <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="Error"/>}
                            {app.status === 'stopped' && <div className="w-2 h-2 rounded-full bg-gray-300" title="Stopped"/>}
                          </div>
                        </div>
                        
                        <div className="mt-auto flex justify-between items-center text-xs border-t border-neutral-100 pt-3 text-gray-500 font-medium">
                          <span>Updated recently</span>
                          <ChevronRight size={14} className="text-gray-400 group-hover:text-[#007aff] transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-white rounded-[32px] border border-neutral-200/50 shadow-sm m-0">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
               <Server size={28} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Docker Manager</h2>
            <p className="text-gray-500 font-medium">Select a project from the sidebar to manage deployments.</p>
          </div>
        )}
      </div>

      {/* Deployment Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-2xl border border-neutral-200/50 flex flex-col max-h-[90vh]">
             <div className="px-6 py-5 border-b border-neutral-100 flex justify-between items-center bg-white/80 backdrop-blur-sm rounded-t-[24px]">
               <h3 className="font-bold text-xl text-gray-900">Add New Resource</h3>
               <button onClick={() => setShowWizard(false)} className="p-1.5 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition"><X size={16}/></button>
             </div>
             
             <div className="p-6 overflow-y-auto custom-scrollbar bg-gray-50 rounded-b-[24px]">
                <div className="bg-white p-5 rounded-[16px] border border-neutral-200 mb-5 shadow-sm">
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Resource Name</label>
                    <input type="text" placeholder="e.g. my-frontend-app" value={newApp.name} onChange={e => setNewApp({...newApp, name: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] focus:outline-none transition" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Source Type</label>
                    <select value={newApp.build_pack} onChange={e => setNewApp({...newApp, build_pack: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] focus:outline-none transition appearance-none cursor-pointer">
                      <option value="dockerimage">Docker Image (Public Registry)</option>
                      <option value="dockercompose">Docker Compose (Raw Text)</option>
                    </select>
                  </div>
                </div>
                
                <div className="bg-white p-5 rounded-[16px] border border-neutral-200 mb-5 shadow-sm">
                  {newApp.build_pack === 'dockerimage' && (
                    <div className="grid grid-cols-4 gap-4 mb-5">
                      <div className="col-span-3">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Image Name</label>
                        <input type="text" placeholder="e.g. nginx, redis, postgres" value={newApp.docker_image} onChange={e => setNewApp({...newApp, docker_image: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 focus:border-[#007aff] focus:outline-none transition" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tag</label>
                        <input type="text" placeholder="latest" value={newApp.docker_image_tag} onChange={e => setNewApp({...newApp, docker_image_tag: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 focus:border-[#007aff] focus:outline-none transition" />
                      </div>
                    </div>
                  )}
                  
                  {newApp.build_pack === 'dockercompose' && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">docker-compose.yml content</label>
                      <textarea value={newApp.compose_content} onChange={e => setNewApp({...newApp, compose_content: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 font-mono h-40 focus:border-[#007aff] focus:outline-none transition" placeholder="version: '3'&#10;services:&#10;  web:&#10;    image: nginx" />
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Port Mapping</label>
                    <input type="text" placeholder="e.g. 8080:80" value={newApp.ports} onChange={e => setNewApp({...newApp, ports: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 focus:border-[#007aff] focus:outline-none transition" />
                    <p className="text-[10px] font-medium text-gray-400 mt-1.5">Map host ports to container ports. Format: host:container</p>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Environment Variables</label>
                    <textarea placeholder="NODE_ENV=production&#10;DB_PASSWORD=secret" value={newApp.env_vars} onChange={e => setNewApp({...newApp, env_vars: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 font-mono h-24 focus:border-[#007aff] focus:outline-none transition" />
                    <p className="text-[10px] font-medium text-gray-400 mt-1.5">Separate with commas or newlines. Format: KEY=VALUE</p>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button onClick={() => setShowWizard(false)} className="px-5 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-gray-700 font-bold rounded-[12px] transition shadow-sm">Cancel</button>
                  <button 
                    onClick={handleDeployApp} 
                    disabled={!newApp.name || (newApp.build_pack === 'dockerimage' && !newApp.docker_image) || (newApp.build_pack === 'dockercompose' && !newApp.compose_content)}
                    className="px-6 py-2.5 bg-[#007aff] hover:bg-[#0062cc] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-[12px] transition shadow-sm flex items-center"
                  >
                    <Play size={16} className="mr-2 fill-current" /> Save & Deploy
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
