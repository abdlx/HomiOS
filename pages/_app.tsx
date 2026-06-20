import '../src/index.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { installCsrfFetch } from '../src/csrf';

// Mounted on the client only — renders into document.body via portal.
const SystemUIHost = dynamic(() => import('../src/components/SystemUI'), { ssr: false });

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    installCsrfFetch();
    fetch('/api/auth/csrf').catch(() => {});
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />
      </Head>
      <Component {...pageProps} />
      <SystemUIHost />
    </>
  );
}
