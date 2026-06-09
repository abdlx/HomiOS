import App from '../src/App';
import { getSession, isAppInitialized } from '../lib/auth';

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) {
    return { redirect: { destination: '/setup/admin', permanent: false } };
  }
  
  const session = await getSession(context.req);
  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  
  return { props: {} };
}

export default function Files() {
  return <App />;
}
