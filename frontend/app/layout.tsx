import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import '@openmaic/renderer/fonts.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { ServerProvidersInit } from '@/components/server-providers-init';
import { ClientStorageScope } from '@/components/workspace/client-storage-scope';
import { LegacyDataImportPrompt } from '@/components/workspace/legacy-data-import-prompt';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';
import { canOfferUnownedLegacyImport } from '@/lib/server/legacy-import-policy';

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: '星燧计划',
  description: '面向学生的 AI 沉浸式中文课堂。',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = isAuthEnabled() ? await getCurrentUser() : null;
  const allowUnownedLegacyImport = canOfferUnownedLegacyImport({
    featureFlag: process.env.ALLOW_UNOWNED_LEGACY_IMPORT,
    userRole: user?.role,
  });

  return (
    <html lang="zh-CN" className={inter.variable} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ClientStorageScope userId={user?.id}>
          <ThemeProvider>
            <I18nProvider>
              <ServerProvidersInit />
              {children}
              {allowUnownedLegacyImport && <LegacyDataImportPrompt />}
              <Toaster position="top-center" />
            </I18nProvider>
          </ThemeProvider>
        </ClientStorageScope>
      </body>
    </html>
  );
}
