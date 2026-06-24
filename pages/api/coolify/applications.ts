import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiUrl = process.env.COOLIFY_API_URL;
  const apiToken = process.env.COOLIFY_API_TOKEN;

  if (!apiUrl || !apiToken) {
    return res.status(500).json({ error: 'Coolify API configuration is missing.' });
  }

  try {
    const response = await fetch(`${apiUrl}/applications`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Coolify API error: ${errorText}` });
    }

    const data = await response.json();
    
    // Transform the response to match the required format for Desktop Environment
    // Coolify applications response usually contains items with name, status, project, environment, etc.
    const applications = Array.isArray(data) ? data : (data.data || []);
    
    const formattedApps = applications.map((app: any) => ({
      id: `coolify_app_${app.uuid || app.id}`,
      name: app.name,
      status: app.status,
      projectName: app.project?.name || 'Coolify Project',
      url: app.fqdn || '',
    }));

    return res.status(200).json(formattedApps);
  } catch (error: any) {
    console.error('Error fetching Coolify applications:', error);
    return res.status(500).json({ error: 'Failed to fetch Coolify applications', details: error.message });
  }
}
