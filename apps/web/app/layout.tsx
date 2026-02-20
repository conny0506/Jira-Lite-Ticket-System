import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Jira-lite',
  description: 'NestJS + Prisma + BullMQ + Next.js tabanli Jira-lite',
  icons: {
    icon: '/assets/icons/site-icon.jpeg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
