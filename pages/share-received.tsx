import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Folder, FileText, Image as ImageIcon, Video, Music, Link2, Share2, ChevronRight, Check, X, Upload, ArrowLeft, HardDrive } from 'lucide-react';
import { getSession, isAppInitialized } from '../lib/auth';
import Head from 'next/head';

interface SharedItem {
  type: 'file' | 'text' | 'url';
  name: string;
  content?: string;
  path?: string;
}

interface SharePayload {
  id: string;
  createdAt: string;
  title: string;
  text: string;
  url: string;
  items: SharedItem[];
}

interface DriveFolder {
  name: string;
  path: string;
}

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) {
    return { redirect: { destination: '/setup/admin', permanent: false } };
  }
  const session = await getSession(context.req);
  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  let username = 'User';
  if (session.email) {
    const rawName = session.email.split('@')[0];
    username = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  }
  return { props: { username } };
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return <Video size={20} className="text-[#af52de]" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return <ImageIcon size={20} className="text-[#007aff]" />;
  if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return <Music size={20} className="text-[#ff2d55]" />;
  return <FileText size={20} className="text-[#34c759]" />;
}

const QUICK_FOLDERS = [
  { name: 'Downloads', path: 'Downloads', icon: <Upload size={18} className="text-white" />, color: '#007aff' },
  { name: 'Documents', path: 'Documents', icon: <FileText size={18} className="text-white" />, color: '#ff9500' },
  { name: 'Images', path: 'Images', icon: <ImageIcon size={18} className="text-white" />, color: '#34c759' },
  { name: 'Videos', path: 'Videos', icon: <Video size={18} className="text-white" />, color: '#af52de' },
];

export default function ShareReceived({ username }: { username: string }) {
  const router = useRouter();
  const { id } = router.query;
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedItem, setSavedItem] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [step, setStep] = useState<'choose' | 'success'>('choose');
  const [drives, setDrives] = useState<DriveFolder[]>([]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/share-target?id=${id}`)
      .then(r => r.json())
      .then(data => { setPayload(data); setLoading(false); })
      .catch(() => setLoading(false));

    fetch('/api/drives')
      .then(r => r.json())
      .then(data => setDrives(data?.slice(0, 4) || []))
      .catch(() => {});
  }, [id]);

  const handleSaveTo = async (folderPath: string) => {
    if (!payload || saving) return;
    setSaving(true);
    setSelectedFolder(folderPath);

    try {
      const res = await fetch('/api/share-target/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId: payload.id, destinationFolder: folderPath }),
      });

      if (res.ok) {
        setStep('success');
        setSavedItem(folderPath);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-[#007aff]/30 border-t-[#007aff] animate-spin" />
          <p className="text-[#8e8e93] text-sm">Loading shared item…</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <X size={28} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-black mb-2">Share Not Found</h2>
          <p className="text-[#8e8e93] text-sm mb-6">This shared item may have expired or been already saved.</p>
          <button
            onClick={() => router.push('/files')}
            className="px-6 py-3 bg-[#007aff] text-white rounded-full font-semibold text-sm"
          >
            Open Files
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <>
        <Head>
          <title>Saved to Files — HomiOS</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <div className="min-h-screen bg-[#f2f2f7] flex items-center justify-center p-4">
          <div className="text-center max-w-sm w-full">
            <div className="w-20 h-20 rounded-full bg-[#34c759]/20 flex items-center justify-center mx-auto mb-5 animate-[bounce_0.6s_ease-out]">
              <Check size={36} className="text-[#34c759]" />
            </div>
            <h2 className="text-[24px] font-bold text-black mb-2">Saved!</h2>
            <p className="text-[#8e8e93] text-[15px] mb-1">
              {payload.items.length === 1 ? payload.items[0].name : `${payload.items.length} items`}
            </p>
            <p className="text-[#8e8e93] text-[13px] mb-8">→ {savedItem}</p>
            <div className="space-y-3">
              <button
                onClick={() => router.push(`/files?path=${encodeURIComponent(savedItem || '')}`)}
                className="w-full py-3.5 bg-[#007aff] text-white rounded-[14px] font-semibold text-[16px] active:bg-[#0062cc] transition-colors"
              >
                Open in Files
              </button>
              <button
                onClick={() => window.close()}
                className="w-full py-3.5 bg-white text-[#007aff] rounded-[14px] font-semibold text-[16px] border border-[#e5e5ea] active:bg-[#f2f2f7] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Save to HomiOS — {payload.items[0]?.name || 'Shared Item'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
      </Head>
      <div className="min-h-screen bg-[#f2f2f7] pb-safe">
        {/* Header */}
        <div className="bg-white border-b border-[#e5e5ea] px-4 pt-safe">
          <div className="flex items-center gap-3 py-4">
            <button
              onClick={() => window.history.back()}
              className="w-9 h-9 rounded-full bg-[#f2f2f7] flex items-center justify-center active:bg-[#e5e5ea] transition-colors"
            >
              <ArrowLeft size={18} className="text-[#007aff]" />
            </button>
            <div>
              <h1 className="text-[17px] font-semibold text-black">Save to HomiOS</h1>
              <p className="text-[12px] text-[#8e8e93]">Choose a destination</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-5 space-y-5">
          {/* Shared items preview */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#8e8e93] uppercase tracking-wide px-1 mb-2">Sharing</h2>
            <div className="bg-white rounded-[14px] overflow-hidden border border-[#e5e5ea]">
              {payload.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e5ea] last:border-0">
                  <div className="flex-shrink-0">
                    {item.type === 'url' ? <Link2 size={20} className="text-[#007aff]" /> :
                     item.type === 'text' ? <FileText size={20} className="text-[#ff9500]" /> :
                     getFileIcon(item.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-black truncate">{item.name}</p>
                    {item.content && (
                      <p className="text-[12px] text-[#8e8e93] truncate mt-0.5">{item.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick folders */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#8e8e93] uppercase tracking-wide px-1 mb-2">Save to</h2>
            <div className="bg-white rounded-[14px] overflow-hidden border border-[#e5e5ea]">
              {QUICK_FOLDERS.map((folder, i) => (
                <button
                  key={folder.path}
                  onClick={() => handleSaveTo(folder.path)}
                  disabled={saving}
                  className="w-full flex items-center gap-3 px-4 py-3 active:bg-[#f2f2f7] transition-colors border-b border-[#e5e5ea] last:border-0 disabled:opacity-60"
                >
                  <div
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: folder.color }}
                  >
                    {folder.icon}
                  </div>
                  <span className="flex-1 text-left text-[16px] text-black">{folder.name}</span>
                  {saving && selectedFolder === folder.path ? (
                    <div className="w-5 h-5 rounded-full border-2 border-[#007aff]/30 border-t-[#007aff] animate-spin" />
                  ) : (
                    <ChevronRight size={18} className="text-[#c6c6c8]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Browse all */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#8e8e93] uppercase tracking-wide px-1 mb-2">Browse</h2>
            <button
              onClick={() => router.push(`/files?share_id=${payload.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-[14px] border border-[#e5e5ea] active:bg-[#f2f2f7] transition-colors"
            >
              <div className="w-8 h-8 rounded-[8px] bg-[#8e8e93] flex items-center justify-center flex-shrink-0">
                <HardDrive size={18} className="text-white" />
              </div>
              <span className="flex-1 text-left text-[16px] text-black">Browse Files…</span>
              <ChevronRight size={18} className="text-[#c6c6c8]" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
