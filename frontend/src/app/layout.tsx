import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { Nunito } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: { default: 'VolunteerOS', template: '%s · VolunteerOS' },
  description: 'Je evenement, je vrijwilligers en je taken op één plek.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="nl-BE" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" richColors={false} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
