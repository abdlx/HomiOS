import WindowManager from '../src/components/WindowManager';
import { getSession, isAppInitialized } from '../lib/auth';

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) {
    return { redirect: { destination: '/setup/admin', permanent: false } };
  }

  const session = await getSession(context.req);
  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const host = context.req.headers.host || 'localhost';
  const hostname = host.split(':')[0];
  return { redirect: { destination: `http://${hostname}:8000`, permanent: false } };
}

export default function Coolify() {
  return null;
}
