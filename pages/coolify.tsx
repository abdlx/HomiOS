import WindowManager from '../src/components/WindowManager';
import { getSession, isAppInitialized } from '../lib/auth';
import { getCapabilities } from '../lib/capabilities';

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) {
    return { redirect: { destination: '/setup/admin', permanent: false } };
  }

  const session = await getSession(context.req);
  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const capabilities = await getCapabilities();
  if (capabilities.coolify.state === 'disabled') {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  let username = 'User';
  if (session.email) {
    const rawName = session.email.split('@')[0];
    username = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  }
  return { props: { username } };
}

export default function Coolify({ username }: { username: string }) {
  return <WindowManager initialView="coolify" username={username} />;
}
