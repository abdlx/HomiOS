import { withAuth } from '../../../lib/api-auth.ts';
import { getCapabilities } from '../../../lib/capabilities.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const capabilities = await getCapabilities();

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    capabilities,
    // Backwards compatibility keys
    coolify: {
      enabled: capabilities.coolify.configured,
      online: capabilities.coolify.running,
      port: capabilities.coolify.port,
      state: capabilities.coolify.state,
    },
    immich: {
      enabled: capabilities.immich.configured,
      online: capabilities.immich.running,
      port: capabilities.immich.port,
      state: capabilities.immich.state,
    },
    codex: {
      enabled: capabilities.codex.configured,
      online: capabilities.codex.running,
      port: capabilities.codex.port,
      state: capabilities.codex.state,
    },
    codeServer: {
      enabled: capabilities.codeServer.configured,
      online: capabilities.codeServer.running,
      port: capabilities.codeServer.port,
      state: capabilities.codeServer.state,
    },
  });
}, { adminOnly: false });

