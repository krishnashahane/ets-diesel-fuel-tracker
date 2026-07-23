import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { landingFor } from '@/lib/rbac';

export default async function Home() {
  const s = await getSession();
  redirect(s ? landingFor(s.role) : '/login');
}
