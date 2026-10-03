// Local development server: serves the same API plus the static frontend.
import express from 'express';
import { app } from './lib/app.js';

app.use(express.static('public'));
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`CCTV Lab running at http://localhost:${port}`));
