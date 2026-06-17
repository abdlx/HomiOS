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

  // Load notes
  useEffect(() => {
    const saved = localStorage.getItem('openfinder_notes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNotes(parsed);
        if (parsed.length > 0) {
          setActiveNoteId(parsed[0].id);
        }
      } catch (e) {
        console.error('Failed to parse notes');
      }
    } else {
      // Default note
      const defaultNote: Note = {
        id: Date.now().toString(),
        title: 'Welcome to Notes',
        content: 'This is a clean, feature-rich notes app that matches the system design.\n\n- Beautiful typography\n- Auto-saving\n- Seamless integration',
        updatedAt: Date.now(),
      };
      setNotes([defaultNote]);
      setActiveNoteId(defaultNote.id);
      localStorage.setItem('openfinder_notes', JSON.stringify([defaultNote]));
    }
  }, []);

  // Auto-save whenever notes array changes
  useEffect(() => {
    if (notes.length > 0) {
      localStorage.setItem('openfinder_notes', JSON.stringify(notes));
    } else if (notes.length === 0 && localStorage.getItem('openfinder_notes')) {
        localStorage.setItem('openfinder_notes', JSON.stringify([]));
    }
  }, [notes]);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const handleCreateNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: 'New Note',
      content: '',
      updatedAt: Date.now(),
    };
    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
    if (isMobileDrawerOpen) setIsMobileDrawerOpen(false);
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

    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNoteId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setActiveNoteId(remaining.length > 0 ? remaining[0].id : null);
    }
    toast({ message: 'Note deleted', tone: 'success' });
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
        <div
          className={`absolute md:relative z-50 md:z-auto h-full flex flex-col bg-white dark:bg-[#1c1c1e] border-r border-neutral-200/50 dark:border-white/10 w-72 md:w-64 transition-transform duration-300 ${
            isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="p-4 pt-6 md:pt-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
              <Edit3 size={18} className="mr-2 text-amber-500" />
              Notes
            </h2>
            <div className="flex space-x-1">
                <button
                onClick={handleCreateNote}
                className="p-1.5 text-gray-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors"
                title="New Note"
                >
                <Plus size={18} />
                </button>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="md:hidden p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>
          </div>

          <div className="px-4 pb-2">
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-white/5 border-none text-sm rounded-xl px-3 py-2 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-shadow"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 hide-scrollbar">
            {filteredNotes.length === 0 ? (
              <div className="text-center py-8 px-4 text-sm text-gray-400">
                No notes found.
              </div>
            ) : (
              filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => {
                    setActiveNoteId(note.id);
                    if (window.innerWidth < 768) setIsMobileDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-3 rounded-xl transition-colors flex flex-col group ${
                    activeNoteId === note.id
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                      : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="font-semibold text-sm truncate max-w-full">
                    {note.title || 'Untitled Note'}
                  </div>
                  <div
                    className={`text-[11px] mt-1 truncate max-w-full ${
                      activeNoteId === note.id ? 'text-amber-100' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {new Date(note.updatedAt).toLocaleDateString()} &bull; {note.content.substring(0, 30) || 'No additional text'}
                  </div>
                </button>
              ))
            )}
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
                {/* Editor Toolbar (Desktop) */}
                <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-white/5">
                  <div className="flex items-center space-x-2 text-sm text-gray-400">
                    <AlignLeft size={16} />
                    <span>{activeNote.content.split(/\s+/).filter(w => w.length > 0).length} words</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-gray-400 font-medium">
                      Last edited {new Date(activeNote.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="w-px h-4 bg-gray-200 dark:bg-white/10"></div>
                    <button
                      onClick={() => handleDeleteNote(activeNote.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete Note"
                    >
                      <Trash2 size={16} />
                    </button>
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
