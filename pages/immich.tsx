import WindowManager from '../src/components/WindowManager';
import { getSession, isAppInitialized } from '../lib/auth';

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) return { redirect: { destination: '/setup/admin', permanent: false } };
  const session = await getSession(context.req);
  if (!session) return { redirect: { destination: '/login', permanent: false } };
  const rawName = session.email?.split('@')[0] || 'User';
  return { props: { username: rawName.charAt(0).toUpperCase() + rawName.slice(1) } };
}

export default function Immich({ username }: { username: string }) {
  return <WindowManager initialView="immich" username={username} />;
}
