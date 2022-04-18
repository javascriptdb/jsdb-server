import express from "express";
import cors from "cors";
import url from 'url';
import fs from 'fs';
import path from "path";
import rateLimit from 'express-rate-limit'
import passport from "passport";
import 'dotenv/config'
import {default as db} from './db.js'; // Start mongo connection

import authApp from './authApp.js';
import dbApp from "./dbApp.js";
import functionsApp from "./functionsApp.js";
import {importFromBase64, importFromPath} from "./lifecycleMiddleware.js";

export const app = express();

const entryPointUrl = url.pathToFileURL(process.argv[1]).href;
const runningAsLibrary = import.meta.url !== entryPointUrl;

if(runningAsLibrary) {
  const customPath = path.resolve(url.fileURLToPath(entryPointUrl), '../.jsdb');
  await importFromPath(customPath);
}
const indexResult = await db.collection('users').createIndex( { "credentials.email": 1 }, { unique: true } )

const currentDbBundle = await db.collection('bundles').findOne({},{sort:{_id:-1}});
if(currentDbBundle) {
  await importFromBase64(currentDbBundle.file.string);
}

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.RATE_LIMIT || 10000,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

// Apply the rate limiting middleware to all requests
app.use(limiter)

app.use(cors());
const regexpIsoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;

app.use(express.json({
  reviver(key, value) {
    if(regexpIsoDate.test(value)) {
      return new Date(value);
    } else {
      return value;
    }
  }
}));

app.use((req, res, next) => {
  req.db = db;
  const authorization = req.get('Authorization');
  if (authorization) {
    passport.authenticate('jwt', { session: false })(req, res, next);
  } else {
    next()
  }
})
const port = process.env.PORT || 3001;

app.use('/auth', authApp);
app.use('/db', dbApp);
app.use('/functions', functionsApp);

const hostingPath = path.resolve(url.fileURLToPath(entryPointUrl), '../.jsdb/hosting');

if (fs.existsSync(hostingPath)) {
  app.use(express.static(hostingPath, {
    fallthrough: true
  }));
  app.use('*', function (req, res) {
    if(!res.finished) res.sendFile(path.resolve(hostingPath, 'index.html'));
  })
}

export function start() {
  app.listen(port, () => {
    console.log(`Listening on port ${port}`)
  });
}

if (!runningAsLibrary) {
  start();
}