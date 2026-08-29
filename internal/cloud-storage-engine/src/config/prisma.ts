import { PrismaClient } from '@prisma/client'

// Capture the embedded database URL at construction time. HomiOS restores its
// own DATABASE_URL immediately after importing this subsystem, so the engine
// must never lazily read the parent process environment later.
export const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
