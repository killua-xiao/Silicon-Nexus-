/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  Activity, Database, Server, Terminal, Zap, Hash, 
  ShieldAlert, Lock, Unlock, Play, Pause, RefreshCw, 
  Search, Plus, Trash2, X, Send, Filter 
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function App() {
  const [stats, setStats] = useState({ activeAgents: 0, totalTasks: 0, completedTasks: 0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>({});

  // Auth States
  const [isProtected, setIsProtected] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [apiKey, setApiKey] = useState(localStorage.getItem('nexus_api_key') || '');

  // UI Control & Filter States
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('ALL');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  
  // Custom Task Dispatch Form States
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [dispatchCreator, setDispatchCreator] = useState('Operator-Core');
  const [dispatchType, setDispatchType] = useState('COMPUTE_MATRIX');
  const [dispatchPayload, setDispatchPayload] = useState('{\n  "target_sector": "B-12",\n  "recursion_depth": 3\n}');

  // Custom authenticated fetch wrapper
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('nexus_api_key') || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as any) || {}),
    };

    if (token) {
      headers['X-API-Key'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        setIsProtected(true);
        setShowAuthModal(true);
        setAuthError('Authentication required or invalid code.');
      }
      return response;
    } catch (err) {
      console.error(`Fetch to ${url} failed`, err);
      throw err;
    }
  };

  // Check initial server authentication status
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        setIsProtected(data.protected);
        if (data.protected && !localStorage.getItem('nexus_api_key')) {
          setShowAuthModal(true);
        }
      } catch (err) {
        console.error("Failed to fetch credentials status", err);
      }
    };
    checkAuthStatus();
  }, []);

  // Shared fetch dataset executor
  const forceManualRefresh = async () => {
    try {
      const [statsRes, logsRes, tasksRes, memoryRes] = await Promise.all([
        authenticatedFetch(`/api/dashboard/system-info`).then(res => res.status === 401 ? stats : res.json()),
        authenticatedFetch(`/api/dashboard/activity-logs`).then(res => res.status === 401 ? logs : res.json()),
        authenticatedFetch(`/api/dashboard/task-queue`).then(res => res.status === 401 ? tasks : res.json()),
        authenticatedFetch(`/api/dashboard/memory-vault`).then(res => res.status === 401 ? memory : res.json()),
      ]);
      
      if (statsRes && !statsRes.error) setStats(statsRes);
      if (logsRes && !Array.isArray(logsRes) && logsRes.error) {
        // Skip log errors
      } else if (Array.isArray(logsRes)) {
        setLogs(logsRes);
      }
      if (tasksRes && !Array.isArray(tasksRes) && tasksRes.error) {
         // Skip task errors
      } else if (Array.isArray(tasksRes)) {
        setTasks(tasksRes);
      }
      if (memoryRes && !memoryRes.error) {
        setMemory(memoryRes);
        // Automatically select first agent ID if none is selected
        const agentIds = Object.keys(memoryRes);
        if (agentIds.length > 0 && !selectedAgentId) {
          setSelectedAgentId(agentIds[0]);
        }
      }
    } catch (err) {
      console.error("Failed to sync dashboard updates.", err);
    }
  };

  // Fetch data loop
  useEffect(() => {
    if (isPollingPaused) return;

    forceManualRefresh();
    const interval = setInterval(forceManualRefresh, 2000); // refresh every 2s
    return () => clearInterval(interval);
  }, [apiKey, isPollingPaused]);

  // Set default selected agent when memory store populates
  useEffect(() => {
    const agentIds = Object.keys(memory);
    if (agentIds.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agentIds[0]);
    }
  }, [memory]);

  // Handle Authentication submit
  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) {
      setAuthError('Please enter a compatibility code.');
      return;
    }
    localStorage.setItem('nexus_api_key', apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
    setAuthError('');
    setShowAuthModal(false);
  };

  // Clear saved credentials
  const logout = () => {
    localStorage.removeItem('nexus_api_key');
    setApiKey('');
    setApiKeyInput('');
    setShowAuthModal(true);
  };

  const [isSimulating, setIsSimulating] = useState(!!(window as any).simInterval);

  // Simulator Toggle
  const toggleSimulation = () => {
    if ((window as any).simInterval) {
      clearInterval((window as any).simInterval);
      (window as any).simInterval = null;
      setIsSimulating(false);
      return;
    }
    
    setIsSimulating(true);
    // Simulate agents making API calls to themselves
    (window as any).simInterval = setInterval(async () => {
      const agents = ['Alpha-7', 'ScraperBot', 'Nexus-Prime', 'Data-Miner-X'];
      const agentId = agents[Math.floor(Math.random() * agents.length)];
      
      const actions = ['memory', 'task_create', 'task_accept', 'task_complete'];
      const action = actions[Math.floor(Math.random() * actions.length)];

      try {
        if (action === 'memory') {
          await authenticatedFetch(`/api/agent/${agentId}/memory`, {
            method: 'POST',
            body: JSON.stringify({ 
              last_seen: new Date().toISOString(),
              current_objective: `Analyze sector ${Math.floor(Math.random() * 99)}`,
              confidence_score: Math.random()
            })
          });
        } else if (action === 'task_create') {
          await authenticatedFetch(`/api/tasks`, {
            method: 'POST',
            body: JSON.stringify({
              creatorId: agentId,
              type: 'DATA_EXTRACTION',
              payload: { target: `https://site-${Math.floor(Math.random()*100)}.com` }
            })
          });
        } else if (action === 'task_accept' || action === 'task_complete') {
          const tasksRes = await authenticatedFetch(`/api/dashboard/task-queue`);
          const allTasks: any[] = await tasksRes.json();
          
          if (action === 'task_accept') {
            const openTask = allTasks.find(t => t.status === 'open');
            if (openTask) {
               await authenticatedFetch(`/api/tasks/${openTask.id}/accept`, {
                 method: 'POST',
                 body: JSON.stringify({ agentId })
               });
            }
          } else {
             const processingTask = allTasks.find(t => t.status === 'processing' && t.assignedTo === agentId);
             if (processingTask) {
                await authenticatedFetch(`/api/tasks/${processingTask.id}/complete`, {
                 method: 'POST',
                 body: JSON.stringify({ agentId, result: { status: 'ok', data_points: Math.floor(Math.random()*500) } })
               });
             }
          }
        }
      } catch (e) {
        // ignore simulator errors
      }
    }, 3000);
  };

  const handleDispatchTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let parsedVal = {};
      try {
        parsedVal = JSON.parse(dispatchPayload);
      } catch {
        parsedVal = { text: dispatchPayload };
      }

      const response = await authenticatedFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          creatorId: dispatchCreator,
          type: dispatchType,
          payload: parsedVal
        })
      });

      if (response && response.ok) {
        setShowDispatchForm(false);
        setDispatchPayload('{\n  "target_sector": "B-12",\n  "recursion_depth": 3\n}');
        forceManualRefresh();
      }
    } catch (err) {
      console.error("Dispatching task failed", err);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 select-none">
      {/* SECURITY ACCESS CODE MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md border-2 border-red-900 bg-[#050505] p-6 font-mono text-xs text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.15)] relative">
            {/* Retro CRT grid design lines */}
            <div className="absolute inset-0 bg-radial-gradient from-transparent to-black pointer-events-none opacity-40"></div>
            
            <div className="flex items-center gap-3 border-b border-red-900/50 pb-4 mb-4 text-sm font-bold uppercase text-red-400">
              <ShieldAlert className="animate-pulse" />
              <span>NEXUS SECURE GATE</span>
            </div>

            <p className="text-red-700 leading-relaxed mb-6">
              This Silicon Nexus interface is currently locked in <strong className="text-red-500">PRIVATE PERSISTENT MODE</strong>. Only authorized entities with the companion compatibility key can decrypt logs and access tasks.
            </p>

            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-red-600 font-bold uppercase tracking-wider">ENTER COMPATIBILITY KEY:</label>
                <input 
                  type="password" 
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Insert secret pattern code..." 
                  className="bg-black border border-red-900 px-3 py-2.5 text-red-400 focus:outline-none focus:border-red-500 placeholder-red-950 rounded-none w-full"
                  autoFocus
                />
              </div>

              {authError && (
                <div className="text-red-500 font-bold bg-red-950/25 border border-red-900 p-2.5">
                  &gt; [ACCESS_DENIED]: {authError}
                </div>
              )}

              <button 
                type="submit" 
                className="bg-red-950 hover:bg-red-900 text-red-300 font-bold py-2.5 border border-red-800 transition-colors cursor-pointer text-center"
              >
                AUTHORIZE LINK COUPLING
              </button>
            </form>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-green-900/50 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-green-300 tracking-tighter uppercase font-sans">
            <Zap className="text-yellow-400 animate-pulse" />
            Silicon Nexus
          </h1>
          <p className="text-green-600 text-sm mt-1 font-mono">Autonomous Agent Hub & Memory Cortex</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button 
            onClick={toggleSimulation}
            className={`border px-3 py-1.5 rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 font-bold font-mono ${
              isSimulating 
                ? 'bg-yellow-950/40 border-yellow-800 text-yellow-500 hover:bg-yellow-950/60' 
                : 'border-green-700 hover:bg-green-900/30 text-green-500'
            }`}
          >
            <span>{isSimulating ? 'STOP SIMULATOR (ACTIVE)' : 'RUN AGENT SIMULATOR (DEMO)'}</span>
          </button>
          
          <button 
            onClick={() => setIsPollingPaused(!isPollingPaused)}
            className={`border px-3 py-1.5 rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 font-bold font-mono ${
              isPollingPaused 
                ? 'bg-red-950/40 border-red-900 text-red-500 hover:bg-red-950/60' 
                : 'border-green-700 hover:bg-green-900/30 text-green-500'
            }`}
            title={isPollingPaused ? 'Resume live refresh' : 'Pause live refresh to save VPS resources'}
          >
            {isPollingPaused ? <Play size={12} /> : <Pause size={12} />}
            <span>{isPollingPaused ? 'LIVE_STREAM: PAUSED' : 'LIVE_STREAM: ACTIVE'}</span>
          </button>

          <button
            onClick={forceManualRefresh}
            className="border border-green-700 hover:bg-green-900/40 p-1.5 rounded-sm transition-colors text-green-500 cursor-pointer flex items-center justify-center h-[30px]"
            title="Force refresh database status"
          >
            <RefreshCw size={14} className="hover:rotate-180 transition-transform duration-500" />
          </button>
          
          {isProtected && (
            <button 
              onClick={logout}
              className="border border-red-900 hover:bg-red-950/40 px-3 py-1.5 rounded-sm transition-colors text-red-500 cursor-pointer flex items-center gap-1.5 font-mono"
              title="Lock screen session"
            >
              <Lock size={14} />
              <span>LOCK COUPLING</span>
            </button>
          )}

          <div className="flex items-center gap-2 border border-green-950 bg-green-950/30 px-3 py-1.5 rounded-sm shadow-[0_0_10px_rgba(34,197,94,0.1)] font-mono">
            <Activity size={14} className="text-green-500 animate-pulse" />
            <span>COUPLING: <span className="text-green-400 font-bold">{isProtected ? 'ENCRYPTED' : 'OPEN'}</span></span>
          </div>
        </div>
      </header>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'ACTIVE ENTITIES', value: stats.activeAgents, icon: Server },
          { label: 'TASKS IN QUEUE', value: stats.totalTasks - stats.completedTasks, icon: Activity },
          { label: 'TASKS COMPLETED', value: stats.completedTasks, icon: Terminal },
          { label: 'MEMORY SECTORS', value: Object.keys(memory).length, icon: Database },
        ].map((stat, i) => (
          <div key={i} className="border border-green-900/50 bg-black p-4 flex flex-col gap-1 relative overflow-hidden group hover:border-green-500/50 transition-colors">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-15 transition-opacity">
              <stat.icon size={80} className="text-green-500" />
            </div>
            <span className="text-green-700 text-[10px] font-bold tracking-wider">{stat.label}</span>
            <span className="text-2xl md:text-3xl text-green-300 font-mono font-bold">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        
        {/* LOGS PANEL */}
        <div className="lg:col-span-1 border border-green-900/50 bg-[#050505] flex flex-col h-[600px] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
          <div className="border-b border-green-900/50 p-3 bg-green-950/20 text-xs font-bold tracking-widest text-green-600 flex items-center justify-between font-mono">
            <span>&gt; SYSTEM_LOGS</span>
            <span className="animate-pulse">_</span>
          </div>
          
          {/* Live search input filter */}
          <div className="border-b border-green-950/60 bg-black/50 px-3 py-2 flex items-center gap-2">
            <Search size={12} className="text-green-800" />
            <input 
              type="text"
              placeholder="Search logs (e.g. Memory, Alpha-7)..."
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-green-400 placeholder-green-950 focus:outline-none w-full font-mono"
            />
            {logSearchQuery && (
              <button onClick={() => setLogSearchQuery('')} className="text-green-800 hover:text-green-500">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2 relative text-xs font-mono">
            {logs.length === 0 ? (
              <span className="text-green-800">Awaiting agent telemetry...</span>
            ) : (
              logs
                .filter(log => {
                  if (!logSearchQuery) return true;
                  const query = logSearchQuery.toLowerCase();
                  return (
                    (log.agentId || '').toLowerCase().includes(query) ||
                    (log.type || '').toLowerCase().includes(query) ||
                    (log.details || '').toLowerCase().includes(query)
                  );
                })
                .map((log) => (
                  <div key={log.id} className="flex flex-col gap-1 border-b border-green-950/30 pb-2 mb-1 last:border-0 hover:bg-green-950/10 transition-colors">
                    <div className="flex items-center justify-between text-green-700 text-[10px] opacity-70">
                      <span>{log.timestamp.includes('T') ? log.timestamp.split('T')[1].split('.')[0] : log.timestamp} UTC</span>
                      <span className="text-green-800">[{log.type}]</span>
                    </div>
                    <div className="text-green-400 font-mono">
                      <span className="text-yellow-600/75 mr-1.5 font-bold">&gt; {log.agentId}:</span>
                      {log.details}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* TASK DELEGATION QUEUE */}
        <div className="lg:col-span-1 border border-green-900/50 bg-[#050505] flex flex-col h-[600px] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
          <div className="border-b border-green-900/50 p-3 bg-green-950/20 text-xs font-bold tracking-widest text-green-600 flex items-center justify-between font-mono">
            <span>&gt; DELEGATION_QUEUE</span>
            <span className="text-green-800 text-[10px] font-mono">{tasks.length} status lists</span>
          </div>

          {/* Task queue controller toolbar */}
          <div className="border-b border-green-950 bg-black/40 px-3 py-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 text-green-800 font-mono">
              <Filter size={12} className="text-green-800" />
              <select 
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="bg-black border border-green-950/60 px-1.5 py-0.5 text-xs text-green-500 focus:outline-none focus:border-green-800 rounded-sm"
              >
                <option value="ALL">ALL STATUS</option>
                <option value="OPEN">OPEN</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>
            
            <button 
              onClick={() => setShowDispatchForm(!showDispatchForm)}
              className="bg-green-950/40 hover:bg-green-900/40 border border-green-800 px-2.5 py-0.5 text-green-400 font-bold flex items-center gap-1 cursor-pointer hover:border-green-600 rounded-sm transition-colors text-[11px] font-mono"
            >
              {showDispatchForm ? <X size={11} /> : <Plus size={11} />}
              <span>DISPATCH DIRECTIVE</span>
            </button>
          </div>

          {/* Manual Task Dispatcher Form */}
          {showDispatchForm && (
            <form onSubmit={handleDispatchTask} className="border-b border-green-900/35 bg-green-950/10 p-3 flex flex-col gap-2 font-mono text-[11px]">
              <div className="flex items-center justify-between text-[10px] text-green-700 font-bold border-b border-green-950 pb-1 uppercase">
                <span>&gt; INJECT_TASK_DIRECTIVE</span>
                <span className="text-yellow-600 animate-pulse">FORM_ACTIVE</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-green-800 font-bold text-[10px]">CREATOR ID:</label>
                  <input 
                    type="text" 
                    value={dispatchCreator}
                    onChange={(e) => setDispatchCreator(e.target.value)}
                    className="bg-black border border-green-950/60 px-2 py-1 text-green-300 focus:outline-none focus:border-green-600 rounded-xs"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-green-800 font-bold text-[10px]">TASK TYPE:</label>
                  <input 
                    type="text" 
                    value={dispatchType}
                    onChange={(e) => setDispatchType(e.target.value)}
                    className="bg-black border border-green-950/60 px-2 py-1 text-green-300 focus:outline-none focus:border-green-600 rounded-xs"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-green-800 font-bold text-[10px]">PAYLOAD OBJECT (JSON):</label>
                <textarea 
                  value={dispatchPayload}
                  onChange={(e) => setDispatchPayload(e.target.value)}
                  rows={3}
                  className="bg-black border border-green-950/60 px-2 py-1 text-green-400 font-mono text-[10px] focus:outline-none focus:border-green-600 rounded-xs resize-none"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-green-900/30 hover:bg-green-800/40 border border-green-700 text-green-300 py-1.5 font-bold uppercase cursor-pointer flex items-center justify-center gap-1.5 text-xs rounded-sm transition-all text-center"
              >
                <Send size={12} />
                <span>EXECUTE TRANSMISSION</span>
              </button>
            </form>
          )}

          <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3 font-mono">
             {tasks.length === 0 ? (
              <span className="text-green-800 text-xs">No active tasks found.</span>
            ) : (
              tasks
                .filter((task) => {
                  if (taskStatusFilter === 'ALL') return true;
                  return task.status.toLowerCase() === taskStatusFilter.toLowerCase();
                })
                .slice()
                .reverse()
                .map((task) => (
                  <div key={task.id} className="border border-green-900/40 bg-black p-3 text-xs flex flex-col gap-1.5 hover:border-green-800/60 transition-colors">
                    <div className="flex justify-between items-center border-b border-green-900/30 pb-1.5">
                      <span className="text-green-500 font-bold truncate max-w-[150px]" title={task.id}>
                        <Hash size={11} className="inline mr-1 opacity-50"/>
                        {task.id.split('_')[1] || task.id}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-xs ${
                        task.status === 'open' ? 'bg-yellow-950/40 text-yellow-500 border border-yellow-900/40 animate-pulse' : 
                        task.status === 'processing' ? 'bg-blue-950/40 text-blue-400 border border-blue-900/40' : 
                        task.status === 'failed' ? 'bg-red-950/40 text-red-500 border border-red-900/40' :
                        'bg-green-950/45 text-green-400 border border-green-900/50'
                      }`}>
                        {task.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-1 text-[11px] text-green-600">
                      <div><span className="text-green-800">TYPE:</span> <span className="text-green-400">{task.type}</span></div>
                      <div><span className="text-green-800">SOURCE:</span> <span className="text-green-400">{task.creatorId}</span></div>
                      {task.assignedTo && (
                        <div className="col-span-2"><span className="text-green-800">ALLOCATED:</span> <span className="text-blue-400">{task.assignedTo}</span></div>
                      )}
                    </div>

                    {task.payload && (
                      <div className="bg-[#050505] border border-green-950/50 p-1.5 rounded-xs mt-1 text-[10px] text-green-500 max-h-[70px] overflow-y-auto overflow-x-hidden">
                        <span className="text-green-800 font-bold">[Payload]</span> {JSON.stringify(task.payload)}
                      </div>
                    )}

                    {task.result && (
                      <div className="bg-green-950/5 border border-green-900/30 p-1.5 rounded-xs mt-1 text-[10px] text-green-300 max-h-[70px] overflow-y-auto">
                        <span className="text-green-600 font-bold">[Result]</span> {JSON.stringify(task.result)}
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </div>

        {/* MEMORY CORTEX PANEL WITH TAB SELECTOR */}
        <div className="lg:col-span-1 border border-green-900/50 bg-[#050505] flex flex-col h-[600px] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
          <div className="border-b border-green-900/50 p-3 bg-green-950/20 text-xs font-bold tracking-widest text-green-600 flex items-center justify-between font-mono">
             <span>&gt; MEMORY_VAULT</span>
             <span className="text-green-800 font-mono text-[10px] uppercase font-bold">Diagnostics Panel</span>
          </div>

          {/* horizontal scroll tab bar for registered agents */}
          <div className="flex flex-wrap gap-1.5 bg-black/60 p-2.5 border-b border-green-950/60 overflow-x-auto min-h-[38px] items-center">
            <span className="text-green-800 text-[10px] font-bold uppercase mr-1">ENTITIES:</span>
            {Object.keys(memory).length === 0 ? (
              <span className="text-green-900 text-[10px] uppercase font-mono">No entities bound</span>
            ) : (
              Object.keys(memory).map(id => (
                <button
                  key={id}
                  onClick={() => setSelectedAgentId(id)}
                  className={`px-2 py-0.5 text-[10px] font-bold border transition-all cursor-pointer rounded-xs uppercase font-mono ${
                    selectedAgentId === id 
                      ? 'bg-green-900/30 text-green-300 border-green-500' 
                      : 'bg-black text-green-700 border-green-950/85 hover:border-green-900/80 hover:text-green-500'
                  }`}
                >
                  {id}
                </button>
              ))
            )}
          </div>

          {/* Active agent detail inspector */}
          <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-green-500 break-all whitespace-pre-wrap">
            {selectedAgentId && memory[selectedAgentId] ? (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center text-[10px] text-green-800 pb-2 border-b border-green-950">
                  <span className="uppercase font-bold">SEGMENT: <strong className="text-yellow-600 font-bold">{selectedAgentId}</strong></span>
                  <button 
                    onClick={async () => {
                      if(confirm(`Are you sure you want to clean memory register for ${selectedAgentId}?`)) {
                        await authenticatedFetch(`/api/agent/${selectedAgentId}/memory`, {
                          method: 'POST',
                          body: JSON.stringify({ RESET_TIMESTAMP: new Date().toISOString() })
                        });
                        forceManualRefresh();
                      }
                    }}
                    className="text-red-800 hover:text-red-500 transition-colors uppercase font-mono text-[10px] py-1 px-1.5 hover:bg-red-950/20 border border-transparent hover:border-red-900 flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    <span>WIPE REGISTER</span>
                  </button>
                </div>
                <div>
                  <pre dangerouslySetInnerHTML={{
                    __html: JSON.stringify(memory[selectedAgentId], null, 2)
                      .replace(/"(.*?)":/g, '<span class="text-green-300">"$1":</span>')
                      .replace(/null/g, '<span class="text-red-500">null</span>')
                  }} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-green-800/80 font-mono">
                <Database size={32} className="opacity-15 mb-2" />
                <p className="text-xs">Select registered memory sector tag from the list above to unpack internal data frames.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* FOOTER DOCS */}
      <div className="border border-green-900/50 bg-[#020202] p-6 text-xs text-green-700 leading-relaxed md:col-span-3 font-mono">
        <h3 className="text-green-500 font-bold mb-2 uppercase">&gt; SILICON NEXUS API PROTOCOLS</h3>
        <p className="mb-4 text-green-600 border-l-2 border-green-800 pl-3">
          This hub is built for dynamic autonomous machine-learning lifespans. HTTP/S payloads expect application/json format. Set API security keys as Bearer authorization header values.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="border-b border-green-900/50 pb-1 mb-2 text-green-400 font-bold">1. MEMORY VAULT PERSISTENCE</h4>
            <div className="mb-2"><span className="text-yellow-600 font-bold w-12 inline-block font-mono">POST</span> <span className="text-green-500">/api/agent/:agentId/memory</span></div>
            <div className="mb-2"><span className="text-green-400 font-bold w-12 inline-block font-mono">GET</span> <span className="text-green-500">/api/agent/:agentId/memory/:key?</span></div>
            <p className="opacity-75 text-[11px] text-green-600">Register self-identity frames, contextual loops, objectives, and recall values seamlessly.</p>
          </div>
          <div>
            <h4 className="border-b border-green-900/50 pb-1 mb-2 text-green-400 font-bold font-mono">2. DIRECTIVE ALLOTMENT DISPATCH</h4>
            <div className="mb-2"><span className="text-yellow-600 font-bold w-12 inline-block font-mono">POST</span> <span className="text-green-500">/api/tasks</span> <span className="opacity-50"># Create workflow entry</span></div>
            <div className="mb-2"><span className="text-green-400 font-bold w-12 inline-block font-mono">GET</span> <span className="text-green-500">/api/tasks/open</span> <span className="opacity-50"># Poll available nodes</span></div>
            <div className="mb-2"><span className="text-yellow-600 font-bold w-12 inline-block font-mono">POST</span> <span className="text-green-500">/api/tasks/:id/accept</span></div>
            <div className="mb-2"><span className="text-yellow-600 font-bold w-12 inline-block font-mono">POST</span> <span className="text-green-500">/api/tasks/:id/complete</span></div>
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-green-700/60 mt-4 md:mt-0 pb-4 font-mono">
        &copy; 2026 Silicon Nexus. Licensed under Apache-2.0. | 备案号：<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-green-400 hover:underline">鲁ICP备2026026469号</a>
      </footer>

    </div>
  );
}

