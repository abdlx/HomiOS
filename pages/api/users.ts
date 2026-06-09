import { NextApiRequest, NextApiResponse } from 'next';
import Database from 'better-sqlite3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = new Database(process.env.DATABASE_URL || './data/filemanager.db');

    // Check if the users table exists before querying
    const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get();
    if (!tableExists) {
      return res.status(200).json([]);
    }

    const users = db.prepare('SELECT id, email FROM users').all();
    res.status(200).json(users);
  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}
