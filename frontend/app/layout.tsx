import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/AuthProvider';
import { Header } from '@/components/Header';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZebaniTracker',
  description: 'Lleva el control de los animes que ves',
  appleWebApp: { capable: true, title: 'Zebani', statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0A1322',
  viewportFit: 'cover', width: 'device-width', initialScale: 1,
};

/** Aplica el tema guardado antes de pintar (oscuro por defecto) para que no parpadee. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('zt-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body>
        <ServiceWorker />
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
