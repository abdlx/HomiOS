import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Video } from 'lucide-react';

interface LazyMediaThumbnailProps {
  src?: string;
  alt: string;
  type: 'image' | 'video';
  className?: string;
  mediaClassName?: string;
  rootMargin?: string;
  children?: React.ReactNode;
}

export default function LazyMediaThumbnail({
  src,
  alt,
  type,
  className = '',
  mediaClassName = 'w-full h-full object-cover',
  rootMargin = '700px',
  children,
}: LazyMediaThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!src || shouldLoad) return;

    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, shouldLoad, src]);

  const Icon = type === 'video' ? Video : ImageIcon;

  return (
    <div ref={ref} className={`relative overflow-hidden bg-neutral-100 dark:bg-white/5 ${className}`}>
      {shouldLoad && src ? (
        type === 'video' ? (
          <video
            src={src}
            className={mediaClassName}
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={src}
            alt={alt}
            className={mediaClassName}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-300 dark:text-neutral-600">
          <Icon size={18} />
        </div>
      )}
      {children}
    </div>
  );
}
