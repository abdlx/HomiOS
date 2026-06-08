import { readdir } from 'fs/promises';

export default async function handler(req: any, res: any) {
  try {
    const drives = await readdir('/app/drives', { withFileTypes: true });
    res.json(
      drives
        .filter((d) => d.isDirectory())
        .map((d) => ({
          label: d.name,
          path: `/app/drives/${d.name}`
        }))
    );
  } catch (err) {
    res.json([]);
  }
}
