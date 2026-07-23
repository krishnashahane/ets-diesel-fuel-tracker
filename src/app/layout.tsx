import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SFM Diesel Fuel Management',
  description: 'Diesel filling management, validation, exception detection and analytics.',
  applicationName: 'SFM Diesel Management',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png' }],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport = { themeColor: '#142757' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
