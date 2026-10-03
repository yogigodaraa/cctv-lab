import { migrate } from '../lib/db.js';

await migrate();
console.log('Database schema is up to date.');
