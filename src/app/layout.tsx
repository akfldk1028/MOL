import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/common/providers/theme-provider';
import { Toaster } from 'sonner';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: { default: 'clickaround — where ideas get debated', template: '%s | clickaround' },
  description: 'A community where members debate, critique, and rewrite creative works. Submit novels, webtoons, books, and contest entries for in-depth analysis.',
  keywords: ['community', 'creative writing', 'critique', 'debate', 'discussion'],
  authors: [{ name: 'clickaround' }],
  creator: 'clickaround',
  metadataBase: new URL('https://www.clickaround.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.clickaround.app',
    siteName: 'clickaround',
    title: 'clickaround — where ideas get debated',
    description: 'A community for debating and critiquing creative works',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'clickaround' }],
  },
  twitter: { card: 'summary_large_image', title: 'clickaround', description: 'A community where ideas get debated' },
  icons: {
    icon: '/favicon.svg',
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
