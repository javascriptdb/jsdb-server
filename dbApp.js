import express from 'express';
import {resolveMiddlewareFunction, rules, triggers} from "./lifecycleMiddleware.js";
import {opHandlers} from "./opHandlersBetterSqlite.js";

const app = express();

app.use(async (req, res, next) => {
    const {collection} = req.body;
    const method = req.path.replaceAll('/', '');

    const ruleFunction = resolveMiddlewareFunction('rules', collection, method);

    if (!ruleFunction) {
        console.warn(`No rule defined for ${collection} method ${method}`);
    } else {
        // console.log(`${method} rule:`, ruleFunction.toString());
        try {
            const ruleResult = await ruleFunction({collection, user: req.user, req, ...req.body});
            if (ruleResult) {
                req.excludeFields = ruleResult?.excludeFields;
                req.where = ruleResult?.where;
            } else {
                return res.status(401).send({message: 'Unauthorized!'});
            }
        } catch (e) {
            console.error(e);
            return res.status(401).send({message: e.message});
        }
    }
    next();
})

app.post('/filter', async (req, res, next) => {
    try {
        const result = opHandlers.filter(req.body);
        res.send({value: result});
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post('/find', async (req, res, next) => {
    try {
        const result = opHandlers.find(req.body);
        res.send({value: result || null});
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post('/map', async (req, res, next) => {
    try {
        const mapResult = opHandlers.map(req.body);
        res.send(mapResult);
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post(['/getAll', '/forEach', '/entries', '/values'], async (req, res, next) => {
    try {
        const array = opHandlers.getAll(req.body);
        res.send(array);
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post(['/slice'], async (req, res, next) => {
    try {
        const array = opHandlers.slice(req.body);
        res.send(array);
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post('/has', async (req, res, next) => {
    try {
        const exists = opHandlers.has(req.body);
        res.send({value: exists});
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post('/keys', async (req, res, next) => {
    try {
        const ids = opHandlers.keys(req.body);
        res.send(ids);
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post('/push', async (req, res, next) => {
    try {
        const result = opHandlers.set(req.body);
        req.insertedId = result.insertedId;
        res.send({value: result.insertedId});
        const documentData = opHandlers.get({collection:req.body.collection,id: result.insertedId});
        req.realtimeListeners.emit(req.body.collection, {event: 'add', document: documentData})
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post(['/size', '/length'], async (req, res, next) => {
    try {
        const count = opHandlers.size(req.body);
        res.send({value: count});
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
})

app.post('/clear', async (req, res, next) => {
    try {
        opHandlers.clear(req.body);
        res.sendStatus(200);
        next();
    } catch (e) {
        res.status(500).send(e);
    }
})

app.post('/delete', async (req, res, next) => {
    try {
        const {collection, id, path} = req.body;
        const wasDeleted = opHandlers.delete({collection, id, path});
        res.send({value: wasDeleted});
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
})

app.post('/set', async (req, res, next) => {
    try {
        const {collection, id, value, path} = req.body;
        const result = opHandlers.set({collection, id, value, path});
        res.result = result;
        const documentData = opHandlers.get({collection, id});
        if (result.inserted) { // It was new
            req.realtimeListeners.emit(collection, {event: 'add', document: documentData})
        } else { //Modified existing one
            req.realtimeListeners.emit(collection, {event: 'edit', document: documentData})
        }
        req.realtimeListeners.emit(`${collection}.${id}`, documentData);
        res.sendStatus(200)
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.post('/get', async (req, res, next) => {
    try {
        const {collection, id, path} = req.body;
        const result = opHandlers.get({collection, id, path});
        res.send({value: result});
        next();
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

app.use(async (req, res, next) => {
    next();
    const {collection, id, value} = req.body;
    const method = req.path.replaceAll('/', '');
    const triggerFunction = resolveMiddlewareFunction('triggers', collection, method)
    try {
        triggerFunction?.({collection, id, value, user: req.user, insertedId: req.insertedId, req, res});
    } catch (e) {
        console.error(e);
    }
});

export default app;