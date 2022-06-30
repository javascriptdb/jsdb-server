import express from "express";
import cors from "cors";
import url from 'url';
import fs from 'fs';
import path from "path";
import rateLimit from 'express-rate-limit'
import passport from "passport";
import { WebSocketServer } from 'ws';
import 'dotenv/config'
import authApp from './authApp.js';
import dbApp from "./dbApp.js";
import functionsApp from "./functionsApp.js";
import EventEmitter from 'events';
import _ from 'lodash-es';
import {
  functions,
  importFromBase64,
  importFromPath, indexes,
  resolveMiddlewareFunction,
  rules,
  triggers
} from "./lifecycleMiddleware.js";
import {opHandlers} from "./opHandlersBetterSqlite.js";
import jwt from "jsonwebtoken";

const wsServer = new WebSocketServer({ noServer: true });
const realtimeListeners = new EventEmitter();

// TODO : move this somewhere proper

wsServer.on('connection', socket => {
  socket.on('message', async message => {
    try {
      const parsedMessage = JSON.parse(message);
      try {
        let token;
        if(parsedMessage.authorization) {
          token = jwt.verify(parsedMessage.authorization.replaceAll('Bearer ',''), process.env.JWT_SECRET);
        }
        const ruleFunction = await resolveMiddlewareFunction('rules', parsedMessage.collection, parsedMessage.operation);
        console.log(`Realtime ${parsedMessage.operation} rule:`, ruleFunction.toString())
        const ruleResult = await ruleFunction({...parsedMessage, user: token?.user})
        if (ruleResult) {
          // TODO : How do we pass this along for the full duration of the subscription
          // req.excludeFields = ruleResult?.excludeFields;
          // req.where = ruleResult?.where;
        } else {
          return socket.send(JSON.stringify({
            operation: 'error',
            context: message,
            message: 'Unauthorized!'
          }));
        }
      } catch (e) {
        console.error(e);
        return socket.send(JSON.stringify({
          operation: 'error',
          context: message,
          message: e.message
        }));
      }

      if(parsedMessage.operation === 'get') {
        const {collection, id, path = [], operation} = parsedMessage;
        const eventName = `${collection}.${id}`;
        function documentChangeHandler(documentData) {
          let value;
          if(path.length > 0) {
            value = _.get(documentData, path);
          } else {
            value = documentData;
          }
          socket.send(JSON.stringify({
            fullPath: `${collection}.${id}` + (path.length > 0 ?  `.${path.join('.')}` : ''),
            value,
            operation,
            content: 'value'
          }));
        }
        const document = opHandlers.get({collection, id})
        documentChangeHandler(document)
        realtimeListeners.on(eventName, documentChangeHandler)
      } else if (parsedMessage.operation === 'filter') {
        const {collection, operations, operation, eventName} = parsedMessage;
        const serverEventName = collection;
        async function collectionChangeHandler(changeData) {
          if(changeData.event === 'drop') {
            socket.send(JSON.stringify({
              content: changeData.event,
              operation,
              eventName
            }));
          } else {
            try {
              const filteredResult = opHandlers.filter({collection, operations});
              socket.send(JSON.stringify({
                content: 'reset',
                value: filteredResult,
                eventName,
                operation,
                collection
              }))
            } catch (e) {
              console.error('Error running filter')
            }
          }
        }
        try {
          const filteredResult = opHandlers.filter({collection, operations});
          socket.send(JSON.stringify({
            content: 'reset',
            value: filteredResult,
            eventName,
            operation,
            collection
          }))
          realtimeListeners.on(serverEventName, collectionChangeHandler)
        } catch (e) {
          console.error('Error running filter')
        }

      }
    } catch (e) {
      console.error(e);
    }
  });
});

export const app = express();

const entryPointUrl = url.pathToFileURL(process.argv[1]).href;
const runningAsLibrary = import.meta.url !== entryPointUrl;

if(runningAsLibrary) {
  const customPath = path.resolve(url.fileURLToPath(entryPointUrl), '../.jsdb');
  await importFromPath(customPath);
}

try {
  const bundles = opHandlers.getAll({collection: 'bundles'});
  const currentDbBundle = bundles[0];
  if(currentDbBundle) {
    await importFromBase64(currentDbBundle.file.string);
  }
} catch (e) {
  console.error(e);
}

if(process.env.RATE_LIMIT) {
  // Apply the rate limiting middleware to all requests
  app.use(rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: process.env.RATE_LIMIT,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  }))
}

app.use(cors());
const regexpIsoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;

app.use(express.json({
  reviver(key, value) {
    if(regexpIsoDate.test(value)) {
      return new Date(value);
    } else {
      return value;
    }
  },
  limit: '1mb'
}));

app.use((req, res, next) => {
  req.realtimeListeners = realtimeListeners;
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
app.use('/__discovery', (req,res) => {
  const response = JSON.parse(JSON.stringify({rules, triggers, functions, indexes},(key, value) => {
    if(typeof value === 'function') {
      return 'fn'
    }
    return value;
  }))
  res.send(response)
})

const hostingPath = path.resolve(url.fileURLToPath(entryPointUrl), '../.jsdb/hosting');

if (fs.existsSync(hostingPath)) {
  app.use(express.static(hostingPath, {
    fallthrough: true,
    maxAge: '5m'
  }));
  app.use('*', function (req, res) {
    if(!res.finished) res.sendFile(path.resolve(hostingPath, 'index.html'));
  })
}

export function start() {
  const server = app.listen(port, () => {
    console.log(`Listening on port ${port}`)
  });
  server.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, socket => {
      wsServer.emit('connection', socket, request);
    });
  });
}

if (!runningAsLibrary) {
  start();
}