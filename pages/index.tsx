import { getSession, isAppInitialized } from '../lib/auth';

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) {
    return { redirect: { destination: '/setup/admin', permanent: false } };
  }
  
  const session = await getSession(context.req);
  if (session) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  
  return { redirect: { destination: '/login', permanent: false } };
}

export default function Home() {
  return null;
}
