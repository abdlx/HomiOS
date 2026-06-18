import React, { useState, useEffect } from 'react';
import { Menu, Plus, Trash2, FileText, ChevronRight, Edit3, AlignLeft, MoreVertical, X } from 'lucide-react';
import { toast, confirmDialog } from './SystemUI';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

interface NotesAppProps {
  onClose?: () => void;
}

export default function NotesApp({ onClose }: NotesAppProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load notes from server
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const res = await fetch('/api/notes');
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setNotes(data);
            setActiveNoteId(data[0].id);
          } else {
            // Create default note if none exist
            const defaultNote: Note = {
              id: Date.now().toString(),
              title: 'Welcome to Notes',
              content: 'This is a clean, feature-rich notes app that syncs to the server automatically.\n\n- Beautiful typography\n- Auto-saving\n- Seamless integration',
              updatedAt: Date.now(),
            };
            await fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(defaultNote)
            });
            setNotes([defaultNote]);
            setActiveNoteId(defaultNote.id);
          }
        }
      } catch (e) {
        console.error('Failed to fetch notes', e);
      }
    };
    fetchNotes();
  }, []);

  // Auto-save active note to server with debounce
  useEffect(() => {
    if (!activeNoteId) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return;

    const timer = setTimeout(() => {
      fetch('/api/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, title: note.title, content: note.content }),
      }).catch(err => console.error('Auto-save failed', err));
    }, 1000);

    return () => clearTimeout(timer);
  }, [notes, activeNoteId]);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const handleCreateNote = async () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: 'New Note',
      content: '',
      updatedAt: Date.now(),
    };
    
    // Save immediately
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNote)
      });
      setNotes([newNote, ...notes]);
      setActiveNoteId(newNote.id);
      if (isMobileDrawerOpen) setIsMobileDrawerOpen(false);
    } catch (e) {
      toast({ message: 'Failed to create note', tone: 'danger' });
    }
  };

  const handleUpdateNote = (id: string, updates: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n))
    );
  };

  const handleDeleteNote = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Delete Note',
      message: 'Are you sure you want to delete this note? This action cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      const res = await fetch('/api/notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
        if (activeNoteId === id) {
          const remaining = notes.filter((n) => n.id !== id);
          setActiveNoteId(remaining.length > 0 ? remaining[0].id : null);
        }
        toast({ message: 'Note deleted', tone: 'success' });
      } else {
        toast({ message: 'Failed to delete note', tone: 'danger' });
      }
    } catch (e) {
      toast({ message: 'Failed to delete note', tone: 'danger' });
    }
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div
      className="h-full w-full flex flex-col select-none overflow-hidden bg-gray-50 dark:bg-[#161618] font-sans transition-colors duration-300"
      onContextMenu={(e) => e.preventDefault()}
    >
      <main className="flex-1 w-full flex overflow-hidden bg-gray-50 dark:bg-[#161618] relative">
        
        {/* Mobile Drawer Overlay */}
        {isMobileDrawerOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsMobileDrawerOpen(false)} />
        )}

        {/* Sidebar (List of Notes) */}
        <div className={`relative flex flex-col select-none justify-between bg-white dark:bg-[#1f1f22] md:border border-neutral-200/50 dark:border-white/10 transition-colors duration-300 ${
          isMobileDrawerOpen
            ? 'absolute z-50 left-0 top-0 bottom-0 w-[280px] shadow-2xl p-4 pt-5 animate-in slide-in-from-left duration-300'
            : 'hidden md:flex w-[240px] md:w-[250px] shadow-sm m-3 rounded-[32px] p-4 pt-5'
        }`}>
          <div className="flex flex-col flex-1 min-h-0">
            {/* macOS Window Title bar actions */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" 
                  title="Close" 
                  onClick={onClose}
                />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
              </div>
              {isMobileDrawerOpen && (
                <button 
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 active:scale-95 transition-all"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Title / Action */}
            <div className="flex items-center justify-between mb-4 px-1 mt-2">
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 tracking-wide">
                Notes
              </h2>
              <button
                onClick={handleCreateNote}
                className="flex items-center justify-center bg-white dark:bg-white/10 hover:bg-neutral-50 dark:hover:bg-white/20 text-neutral-600 dark:text-neutral-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-full w-7 h-7 border border-neutral-200/50 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all cursor-pointer"
                title="New Note"
              >
                <Plus size={14} className="stroke-[2.5]" />
              </button>
            </div>

            {/* Search */}
            <div className="mb-4 px-1">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-neutral-200 dark:border-white/10 rounded-full focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white dark:bg-white/5 text-gray-800 dark:text-gray-100 shadow-inner"
                />
              </div>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-1 sidebar-scroll min-h-0">
              {filteredNotes.length === 0 ? (
                <div className="text-center py-8 px-4 text-xs text-gray-400">
                  No notes found.
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const isActive = activeNoteId === note.id;
                  return (
                    <button
                      key={note.id}
                      onClick={() => {
                        setActiveNoteId(note.id);
                        if (window.innerWidth < 768) setIsMobileDrawerOpen(false);
                      }}
                      className={`w-full flex flex-col items-start px-2 py-2 rounded-md text-left transition-colors font-medium group ${
                        isActive
                          ? 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-neutral-200/50 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold truncate max-w-full w-full">
                        {note.title || 'Untitled Note'}
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 truncate max-w-full w-full ${isActive ? 'opacity-90' : 'opacity-70'}`}
                      >
                        {new Date(note.updatedAt).toLocaleDateString()} &bull; {note.content.substring(0, 30) || 'No text'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area - Matching Files App Styling */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-[#161618] w-full md:pt-3 md:pr-3 md:pb-3">
          
          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-[#1c1c1e] border-b border-neutral-100 dark:border-white/10 z-10">
            <div className="flex items-center">
              <button onClick={() => setIsMobileDrawerOpen(true)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition mr-3">
                <Menu size={20} />
              </button>
              <h1 className="font-semibold text-gray-800 dark:text-white truncate max-w-[150px]">
                {activeNote ? activeNote.title || 'Untitled Note' : 'Notes'}
              </h1>
            </div>
            {activeNote && (
              <button
                onClick={() => handleDeleteNote(activeNote.id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>

          {/* Desktop/Main Editor Panel */}
          <div className="flex-1 flex flex-col bg-white dark:bg-[#1c1c1e] md:rounded-[32px] md:border border-neutral-200/50 dark:border-white/10 shadow-sm overflow-hidden transform-gpu relative">
            
            {activeNote ? (
              <div className="flex flex-col h-full">
                {/* Editor Toolbar (Desktop) - Matching Finder Toolbar */}
                <div className="hidden md:flex flex-row items-center justify-between gap-3 px-6 pt-5 pb-3 bg-transparent select-none border-b border-neutral-100 dark:border-white/5">
                  <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-start">
                    <div className="flex items-center space-x-2 bg-neutral-100/60 dark:bg-white/5 rounded-full px-3 py-1.5 border border-neutral-200/40 dark:border-white/10 shadow-sm">
                      <AlignLeft size={14} className="text-gray-500" />
                      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tracking-wide">
                        {activeNote.content.split(/\s+/).filter(w => w.length > 0).length} words
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
                    <div className="flex items-center space-x-3 bg-neutral-100/60 dark:bg-white/5 rounded-full px-3 py-1.5 border border-neutral-200/40 dark:border-white/10 shadow-sm">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-wide">
                        Last edited {new Date(activeNote.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="w-px h-3 bg-gray-300 dark:bg-white/20"></div>
                      <button
                        onClick={() => handleDeleteNote(activeNote.id)}
                        className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-white/10 hover:shadow-sm transition-all cursor-pointer"
                        title="Delete Note"
                      >
                        <Trash2 size={13} className="stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-16 max-w-4xl mx-auto w-full hide-scrollbar">
                  <input
                    type="text"
                    value={activeNote.title}
                    onChange={(e) => handleUpdateNote(activeNote.id, { title: e.target.value })}
                    placeholder="Note Title"
                    className="w-full text-3xl md:text-4xl font-bold bg-transparent border-none text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none mb-6"
                  />
                  <textarea
                    value={activeNote.content}
                    onChange={(e) => handleUpdateNote(activeNote.id, { content: e.target.value })}
                    placeholder="Start typing your note here..."
                    className="w-full h-[calc(100%-80px)] text-base md:text-lg text-gray-700 dark:text-gray-300 bg-transparent border-none focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 space-y-4">
                <FileText size={48} className="opacity-20" />
                <p className="font-medium text-lg text-gray-500 dark:text-gray-400">No note selected</p>
                <button
                  onClick={handleCreateNote}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                  Create a Note
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

