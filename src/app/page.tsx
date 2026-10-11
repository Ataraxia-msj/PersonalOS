import { AgentWorkspace } from "@/features/agent/agent-workspace";
import {createClient} from '@/lib/supabase/server';
import {redirect} from 'next/navigation';

export default async function HomePage() {
  const client=await createClient();
  const {data,error}=await client.auth.getClaims();
  if(error||!data?.claims?.sub)redirect('/login?next=%2F');
  return <AgentWorkspace ownerId={data.claims.sub} />;
}
