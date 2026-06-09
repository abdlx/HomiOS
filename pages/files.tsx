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
  
  let username = 'User';
  if (session.email) {
    const rawName = session.email.split('@')[0];
    username = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  }
  
  return { props: { username } };
}

export default function Files({ username }: { username: string }) {
  return <WindowManager initialView="files" username={username} />;
}
