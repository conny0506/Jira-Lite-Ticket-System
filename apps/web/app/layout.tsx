import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Jira-lite',
  description: 'NestJS + Prisma + BullMQ + Next.js tabanli Jira-lite',
  icons: {
    icon: '/assets/icons/site-icon.jpg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
