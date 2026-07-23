import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Shell from '@/components/Shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  return <Shell user={{ name: s.name, role: s.role, username: s.username }}>{children}</Shell>;
}
