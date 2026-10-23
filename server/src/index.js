import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDb } from './db.js';
import './firebase.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import { initSockets } from './services/sockets.js';
import { startTelemetryService } from './services/telemetry.js';
import { errorHandler, notFound } from './middleware/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  })
);
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api', notFound);

// Serve the built React app in production (npm run build in /client)
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const server = http.createServer(app);
initSockets(server);

await connectDb();
await startTelemetryService();
server.listen(config.port, () => console.log(`[server] http://localhost:${config.port}  (${config.env})`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
