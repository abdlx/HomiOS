import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiUrl = process.env.COOLIFY_API_URL;
  const apiToken = process.env.COOLIFY_API_TOKEN;

  if (!apiUrl || !apiToken || apiToken === 'your_coolify_bearer_token') {
    return res.status(200).json([]);
  }

  try {
    const fetchOptions: RequestInit = {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    };

    const [appsRes, servicesRes] = await Promise.all([
      fetch(`${apiUrl}/applications`, fetchOptions),
      fetch(`${apiUrl}/services`, fetchOptions)
    ]);

    let combinedItems: any[] = [];

    if (appsRes.ok) {
      const data = await appsRes.json();
      combinedItems = combinedItems.concat(Array.isArray(data) ? data : (data.data || []));
    } else {
      console.warn(`Coolify API applications error (${appsRes.status}): ${await appsRes.text()}`);
    }

    if (servicesRes.ok) {
      const data = await servicesRes.json();
      combinedItems = combinedItems.concat(Array.isArray(data) ? data : (data.data || []));
    } else {
      console.warn(`Coolify API services error (${servicesRes.status}): ${await servicesRes.text()}`);
    }
    
    // Transform the response to match the required format for Desktop Environment
    const formattedApps = combinedItems.map((app: any, index: number) => ({
      id: `coolify_app_${app.uuid || app.id || index}`,
      name: app.name || `Unnamed App ${index}`,
      status: app.status || 'unknown',
      projectName: app.environment?.project?.name || app.project?.name || 'Coolify Project',
      url: app.fqdn || '',
    }));

    formattedApps.push({
      id: `coolify_app_debug_test_1`,
      name: `Debug: items=${combinedItems.length}`,
      status: `running`,
      projectName: appsRes.ok ? 'AppsOK' : 'AppsFail',
      url: servicesRes.ok ? 'ServicesOK' : 'ServicesFail',
    });

    return res.status(200).json(formattedApps);
  } catch (error: any) {
    console.error('Error fetching Coolify applications:', error);
    return res.status(200).json([]);
  }
}
