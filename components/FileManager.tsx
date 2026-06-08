import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Folder, File, Upload, FolderPlus, MoreHorizontal } from 'lucide-react';

export default function FileManager() {
  const [files, setFiles] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  const loadFiles = async () => {
    setLoading(true);
    const res = await fetch(`/api/files?path=${currentPath}`);
    if (res.ok) {
      const data = await res.json();
      setFiles(data);
    }
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', `${currentPath}/${file.name}`);

    const res = await fetch('/api/files', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      loadFiles();
    }
    setUploading(false);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return;

    await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${currentPath}/${name}` })
    });

    loadFiles();
  };

  const handleNavigate = (name: string) => {
    setCurrentPath(`${currentPath}/${name}`.replace(/\/+/g, '/'));
  };

  const handleBack = () => {
    setCurrentPath(currentPath.substring(0, currentPath.lastIndexOf('/')));
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#f2f2f7] text-slate-900 font-sans overflow-hidden">
      {/* Navigation Bar */}
      <div 
        className="flex-none bg-[#f8f8f8]/90 backdrop-blur-md border-b border-[#c6c6c8] z-10"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
      >
        <div className="h-11 flex items-center justify-between px-2 relative">
          {/* Left / Back Button */}
          <div className="flex-1 flex items-center">
            {currentPath ? (
              <button
                onClick={handleBack}
                className="flex items-center text-[#007aff] active:opacity-50 px-2 py-1"
              >
                <ChevronLeft className="w-6 h-6 -ml-1" strokeWidth={2.5} />
                <span className="text-[17px] leading-5">Back</span>
              </button>
            ) : (
              <div className="w-10"></div>
            )}
          </div>
          
          {/* Center / Title */}
          <div className="flex-2 text-center absolute left-1/2 -translate-x-1/2">
            <h1 className="text-[17px] font-semibold tracking-tight text-black truncate max-w-[150px]">
              {currentPath ? currentPath.split('/').pop() : 'Files'}
            </h1>
          </div>
          
          {/* Right / Actions */}
          <div className="flex-1 flex items-center justify-end px-2">
            <button className="text-[#007aff] active:opacity-50 p-1">
              <MoreHorizontal className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto w-full overscroll-y-none">
        <div className="py-4">
          <div className="bg-white border-y border-[#c6c6c8] shadow-sm">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#007aff]"></div>
              </div>
            ) : files.length === 0 ? (
              <p className="text-center text-[#8e8e93] py-12 text-[17px]">No files or folders</p>
            ) : (
              files.map((file, index) => (
                <div
                  key={file.path}
                  className="flex items-stretch bg-white active:bg-[#e5e5ea] cursor-pointer transition-colors duration-150"
                  onClick={() => file.isDir && handleNavigate(file.name)}
                >
                  <div className="px-4 flex items-center">
                    {file.isDir ? (
                      <Folder className="w-8 h-8 text-[#007aff]" strokeWidth={1.5} fill="#007aff" fillOpacity={0.1} />
                    ) : (
                      <File className="w-8 h-8 text-[#8e8e93]" strokeWidth={1.5} />
                    )}
                  </div>
                  
                  <div className={`flex-1 flex items-center justify-between pr-4 py-3 ${
                    index !== files.length - 1 ? 'border-b border-[#c6c6c8]' : ''
                  }`}>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-[17px] font-normal text-black truncate">{file.name}</p>
                      <p className="text-[13px] text-[#8e8e93] mt-0.5">
                        {file.isDir ? 'Folder' : `${(file.size / 1024).toFixed(1)} KB`}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file.name);
                        }}
                        className="p-1.5 hover:bg-red-50 rounded-full active:opacity-50"
                      >
                        <Trash2 className="w-5 h-5 text-[#ff3b30]" strokeWidth={1.5} />
                      </button>
                      {file.isDir && (
                        <ChevronRight className="w-5 h-5 text-[#c6c6c8]" strokeWidth={2} />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div 
        className="flex-none bg-[#f8f8f8]/90 backdrop-blur-md border-t border-[#c6c6c8]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="h-[49px] px-4 flex items-center justify-between">
          <button className="flex flex-col items-center justify-center w-12 text-[#007aff] active:opacity-50">
            <FolderPlus className="w-6 h-6" strokeWidth={1.5} />
          </button>
          
          <div className="text-[11px] text-[#8e8e93] font-medium tracking-wide text-center">
            {files.length} Item{files.length !== 1 && 's'}
          </div>
          
          <label className="flex flex-col items-center justify-center w-12 text-[#007aff] active:opacity-50 cursor-pointer">
            <Upload className="w-6 h-6" strokeWidth={1.5} />
            <input
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Loading Overlay for Upload */}
      {uploading && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur rounded-2xl p-6 flex flex-col items-center shadow-xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007aff] mb-4"></div>
            <p className="text-[17px] font-medium text-black">Uploading...</p>
          </div>
        </div>
      )}
    </div>
  );
}
