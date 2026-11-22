import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZebaniTracker',
    short_name: 'Zebani',
    description: 'Lleva el control de los animes que ves',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A1322',
    theme_color: '#0A1322',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
