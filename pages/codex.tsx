import WindowManager from '../src/components/WindowManager';
import { getSession, isAppInitialized } from '../lib/auth';
import { getCapabilities } from '../lib/capabilities';

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) return { redirect: { destination: '/setup/admin', permanent: false } };
  const session = await getSession(context.req);
  if (!session) return { redirect: { destination: '/login', permanent: false } };

  const capabilities = await getCapabilities();
  if (capabilities.codex.state === 'disabled') {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  const rawName = session.email?.split('@')[0] || 'User';
  return { props: { username: rawName.charAt(0).toUpperCase() + rawName.slice(1) } };
}

export default function Codex({ username }: { username: string }) {
  return <WindowManager initialView="codex" username={username} />;
}
