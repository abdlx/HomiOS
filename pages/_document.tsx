import { Html, Head, Main, NextScript } from 'next/document';

// Applies the saved theme before first paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var p=localStorage.getItem('homios_theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="application-name" content="HomiOS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HomiOS" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Primary manifest — can be swapped via JS before install prompt */}
        <link rel="manifest" href="/manifest.json" id="pwa-manifest" />
        <meta name="theme-color" content="#000000" />
        <link rel="icon" type="image/svg+xml" href="/icon/homios-icon.svg" />
        <link rel="apple-touch-icon" href="/icon/homios-icon.svg" />
        <link rel="shortcut icon" href="/icon/homios-icon.svg" />
        {/* Preload alternate manifests so swap is instant */}
        <link rel="preload" href="/manifest-files.json" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/manifest-notes.json" as="fetch" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
