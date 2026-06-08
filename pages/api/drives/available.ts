import { readdir } from 'fs/promises';
import path from 'path';

export default async function handler(req: any, res: any) {
  const isDev = process.env.NODE_ENV !== 'production';
  const drivesPath = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');

  try {
    const drives = await readdir(drivesPath, { withFileTypes: true });
    res.json(
      drives
        .filter((d) => d.isDirectory())
        .map((d) => ({
          label: d.name,
          path: isDev ? d.name : `/${d.name}`
        }))
    );
  } catch (err) {
    console.error(`Failed to read drives from ${drivesPath}:`, err);
    res.json([]);
  }
}
