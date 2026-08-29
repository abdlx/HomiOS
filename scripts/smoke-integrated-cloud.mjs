import { getCloudStorageRuntime, internalCloudHeaders } from '../lib/cloud-storage-runtime.ts';

const runtime = getCloudStorageRuntime();
const response = await fetch(`${runtime.baseUrl}/health`, { headers: internalCloudHeaders() });
if (!response.ok) throw new Error(`Integrated cloud health returned HTTP ${response.status}`);
const body = await response.json();
if (body.status !== 'ok') throw new Error('Integrated cloud health response was invalid');
console.log('HomiOS integrated cloud storage: healthy');
