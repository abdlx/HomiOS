import { NextApiRequest, NextApiResponse } from 'next';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = await open({
      filename: path.join(process.cwd(), 'openfinder.db'),
      driver: sqlite3.Database
    });

    // Check if the users table exists before querying
    const tableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`);
    if (!tableExists) {
      return res.status(200).json([]);
    }

    const users = await db.all('SELECT id, email FROM users');
    res.status(200).json(users);
  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}
