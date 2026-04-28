import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Board • Jira-lite',
  description: 'Odaklanma panosu',
};

export default function BoardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
