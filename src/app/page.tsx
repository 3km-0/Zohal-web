import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Root page checks auth and redirects appropriately
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/workspaces');
  } else {
    redirect('/home');
  }
}

