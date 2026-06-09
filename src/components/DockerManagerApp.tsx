import React, { useState, useEffect, useRef } from 'react';
import { Box, Play, Square, Settings, Terminal, Plus, Trash, Database, Server, X } from 'lucide-react';
import io from 'socket.io-client';

interface AppProps {
  onClose: () => void;
  initialAppId?: string | null;
}

export default function DockerManagerApp({ onClose, initialAppId }: AppProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newApp, setNewApp] = useState({ name: '', build_pack: 'dockerimage', docker_image: '', docker_image_tag: 'latest', compose_content: '', ports: '', env_vars: '' });
  
  const [deployingApp, setDeployingApp] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchApps(selectedProject);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (initialAppId) {
       // Ideally we'd find the project ID for this app and select it
       fetch('/api/docker/apps/' + initialAppId)
         .then(res => res.json())
         .then(data => {
           if (data && data.project_id) setSelectedProject(data.project_id);
         });
    }
  }, [initialAppId]);

  const fetchProjects = async () => {
    const res = await fetch('/api/docker/projects');
    const data = await res.json();
    setProjects(data);
    if (!selectedProject && data.length > 0 && !initialAppId) setSelectedProject(data[0].id);
  };

  const fetchApps = async (projectId: string) => {
    const res = await fetch(`/api/docker/projects/${projectId}/apps`);
    const data = await res.json();
    setApps(data);
  };

  const handleCreateProject = async () => {
    const name = prompt('Project Name:');
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
    const res = await fetch(`/api/docker/projects/${selectedProject}/apps`, {
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
    fetchApps(selectedProject);
    startDeployment(createdApp.id);
  };

  const startDeployment = async (appId: string) => {
    setDeployingApp(appId);
    setLogs([]);
    const res = await fetch(`/api/docker/apps/${appId}/deploy`, { method: 'POST' });
    const data = await res.json();
    
    if (data.deploymentId) {
      const socket = io();
      socket.emit('join_deployment', data.deploymentId);
      socket.on('log', (line) => {
        setLogs(prev => [...prev, line]);
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };

  const stopApp = async (appId: string) => {
    await fetch(`/api/docker/apps/${appId}/stop`, { method: 'POST' });
    if (selectedProject) fetchApps(selectedProject);
  };

  const deleteApp = async (appId: string) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/docker/apps/${appId}`, { method: 'DELETE' });
    if (selectedProject) fetchApps(selectedProject);
  };

  return (
    <div className="h-full flex flex-col bg-[#F3F4F6] text-gray-800 font-sans">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center space-x-2 text-blue-600">
          <Server size={20} />
          <h2 className="font-bold text-lg">Docker Manager</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-600 uppercase text-xs tracking-wider">Projects</h3>
            <button onClick={handleCreateProject} className="text-blue-500 hover:text-blue-700">
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {projects.map(p => (
              <div 
                key={p.id}
                onClick={() => setSelectedProject(p.id)}
                className={`px-3 py-2 rounded-md cursor-pointer text-sm font-medium transition-colors ${selectedProject === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                {p.name}
              </div>
            ))}
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col">
          {deployingApp ? (
            <div className="flex-1 flex flex-col bg-gray-900 rounded-xl overflow-hidden shadow-xl border border-gray-700">
              <div className="px-4 py-2 bg-gray-800 flex justify-between items-center text-white text-xs uppercase font-bold tracking-wider">
                <span>Deployment Logs</span>
                <button onClick={() => { setDeployingApp(null); if(selectedProject) fetchApps(selectedProject); }} className="hover:text-blue-400">Close</button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto text-green-400 font-mono text-sm">
                {logs.map((log, i) => <div key={i}>{log}</div>)}
                <div ref={logsEndRef} />
              </div>
            </div>
          ) : selectedProject ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Applications</h2>
                <button 
                  onClick={() => setShowWizard(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
                >
                  Deploy New App
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map(app => (
                  <div key={app.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow relative">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                          <Box size={20} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{app.name}</h3>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${app.status === 'running' ? 'bg-green-100 text-green-700' : app.status === 'deploying' ? 'bg-yellow-100 text-yellow-700' : app.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                            {app.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2 mt-6">
                      {app.status === 'running' ? (
                        <button onClick={() => stopApp(app.id)} className="p-2 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-lg"><Square size={16} /></button>
                      ) : (
                        <button onClick={() => startDeployment(app.id)} className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg"><Play size={16} /></button>
                      )}
                      <button onClick={() => deleteApp(app.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg"><Trash size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
             <div className="flex-1 flex items-center justify-center text-gray-400">Select or create a project to get started.</div>
          )}
        </div>
      </div>

      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
             <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
               <h3 className="font-bold text-xl">Deploy New App</h3>
               <button onClick={() => setShowWizard(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
             </div>
             
             <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">App Name</label>
                  <input type="text" value={newApp.name} onChange={e => setNewApp({...newApp, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Source Type</label>
                  <select value={newApp.build_pack} onChange={e => setNewApp({...newApp, build_pack: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="dockerimage">Docker Image</option>
                    <option value="dockercompose">Docker Compose</option>
                  </select>
                </div>
                
                {newApp.build_pack === 'dockerimage' && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Image Name (e.g. nginx)</label>
                      <input type="text" value={newApp.docker_image} onChange={e => setNewApp({...newApp, docker_image: e.target.value})} className="w-full border rounded-lg p-2 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Tag</label>
                      <input type="text" value={newApp.docker_image_tag} onChange={e => setNewApp({...newApp, docker_image_tag: e.target.value})} className="w-full border rounded-lg p-2 outline-none" />
                    </div>
                  </div>
                )}
                
                {newApp.build_pack === 'dockercompose' && (
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">docker-compose.yml</label>
                    <textarea value={newApp.compose_content} onChange={e => setNewApp({...newApp, compose_content: e.target.value})} className="w-full border rounded-lg p-2 outline-none font-mono text-sm h-32" />
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ports (Host:Container)</label>
                  <input type="text" placeholder="e.g. 8080:80" value={newApp.ports} onChange={e => setNewApp({...newApp, ports: e.target.value})} className="w-full border rounded-lg p-2 outline-none" />
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Environment Variables (KEY=VAL,KEY2=VAL2)</label>
                  <input type="text" value={newApp.env_vars} onChange={e => setNewApp({...newApp, env_vars: e.target.value})} className="w-full border rounded-lg p-2 outline-none" />
                </div>
                
                <button onClick={handleDeployApp} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-700">Deploy Application</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
