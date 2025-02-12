import fs from 'fs';
import path from 'node:path';
import readline from 'node:readline';
import http from 'node:http';

import debounce from 'debounce';
import express from 'express';
import cors from 'cors';
import opener from 'opener';
import { Server as SocketIOServer } from 'socket.io';

import promptfoo from '../index.js';
import logger from '../logger';
import { getDirectory } from '../esm';
import { getLatestResultsPath } from '../util';

import type { Request, Response } from 'express';

export function init(port = 15500) {
  const app = express();

  const staticDir = path.join(getDirectory(), 'web', 'client');

  app.use(cors());
  app.use(express.json());
  app.use(express.static(staticDir));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const latestJsonPath = getLatestResultsPath();
  const readLatestJson = () => {
    const data = fs.readFileSync(latestJsonPath, 'utf8');
    const jsonData = JSON.parse(data);
    return jsonData.table;
  };

  io.on('connection', (socket) => {
    // Send the initial table data when a client connects
    socket.emit('init', { table: readLatestJson() });

    // Watch for changes to latest.json and emit the update event
    fs.watch(
      latestJsonPath,
      debounce((event: string) => {
        if (event === 'change') {
          socket.emit('update', { table: readLatestJson() });
        }
      }, 250),
    );
  });

  httpServer.listen(port, () => {
    const url = `http://localhost:${port}`;
    logger.info(`Server listening at ${url}`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Do you want to open the browser to the URL? (y/N): ', async (answer) => {
      if (answer.toLowerCase().startsWith('y')) {
        try {
          await opener(url);
          logger.info(`Opening browser to: ${url}`);
        } catch (err) {
          logger.error(`Failed to open browser: ${String(err)}`);
        }
      }
      rl.close();
      logger.info('Press Ctrl+C to stop the server');
    });
  });
}
