import sqlite3 from "sqlite3";
import {memoizedRun} from "./vm.js";
import _ from "lodash-es"
import * as acorn from "acorn";
import {walk} from "estree-walker";

const db = new sqlite3.Database('./database.sqlite');

export const uuid = () => {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

    let autoId = ''

    for (let i = 0; i < 20; i++) {
        autoId += CHARS.charAt(
            Math.floor(Math.random() * CHARS.length)
        )
    }
    return autoId
}

const tablesCreated = new Map();

async function runPromise(cmd, ...args) {
    return new Promise((resolve, reject) => {
        db[cmd](...args, function (error, data) {
            if (error) {
                reject(error)
            } else {
                resolve({statement: this, data})
            }
        })
    })
}

try {
    await ensureTable('users');
    await runPromise('run',`CREATE UNIQUE INDEX IF NOT EXISTS unique_email ON users (JSON_EXTRACT(value, '$.credentials.email'))`)
} catch (e) {
    console.trace(e);
}

async function ensureTable(collection) {
    if (tablesCreated.has(collection)) return;
    await runPromise('run', `CREATE TABLE IF NOT EXISTS ${collection} (id TEXT PRIMARY KEY, value JSONB)`)
    tablesCreated.set(collection, true);
}

function rowDataToObject(data) {
    return {id: data.id, ...JSON.parse(data.value)};
}

function rowsToObjects(rows) {
    return rows.map(rowDataToObject);
}

const handlers = {
    async getAll({collection}) {
        const result = await runPromise('all', `SELECT * FROM ${collection}`)
        return rowsToObjects(result.data || []);
    },
    async get({collection, id, path = []}) {
        if(path.length > 0) {
            const result = await runPromise('get', `SELECT id, json_extract(value, '$.${path.join('.')}') as value FROM ${collection} WHERE id = $id`, {
                $id: id,
            })
            return result.data.value;
        } else {
            const result = await runPromise('get', `SELECT id,value FROM ${collection} WHERE id = $id`, {
                $id: id,
            })
            return result.data && rowDataToObject(result.data);
        }
    },
    async set({collection, id = uuid(), value, path = []}) {
        const insertSegment = `INSERT INTO ${collection} (id,value) VALUES ($id,json($value))`;
        let result;
        if (path.length > 0) {
            // Make new object from path
            const object = _.set({}, path, value);
            result = await runPromise('run', `${insertSegment} ON CONFLICT (id) DO UPDATE SET value = json_set(value,'$.${path.join('.')}',json($nestedValue)) RETURNING *`, {
                $id: id,
                $value: JSON.stringify(object),
                $nestedValue: JSON.stringify(value)
            })
        } else {
            result = await runPromise('run', `${insertSegment} ON CONFLICT (id) DO UPDATE SET value = $value RETURNING *`, {
                $id: id,
                $value: JSON.stringify(value)
            })
        }
        const inserted = result.statement.changes === 0;
        return {inserted, insertedId: id}
    },
    async push({collection, value}) {
        await handlers.set({collection, value});
        return await handlers.size({collection});
    },
    async delete({collection, id, path = []}) {
        if(path.length > 0) {
            const result = await runPromise('run', `UPDATE ${collection} SET value = json_remove(value,'$.${path.join('.')}') WHERE id = $id`, {
                $id: id,
            })
            return {deletedCount: result.statement.changes};
        } else {
            const result = await runPromise('run', `DELETE FROM ${collection} WHERE id = $id`, {
                $id: id
            })
            return {deletedCount: result.statement.changes};
        }
    },
    async has({collection, id}) {
        const result = await runPromise('get', `SELECT EXISTS(SELECT id FROM ${collection} WHERE id = $id) as found`, {
            $id: id
        })
        return result?.data.found > 0;
    },
    async keys({collection}) {
        const result = await runPromise('all', `SELECT id FROM ${collection}`)
        return result?.data?.map(r => r.id);
    },
    async size({collection}) {
        const result = await runPromise('get', `SELECT COUNT(id) as count FROM ${collection}`)
        return result?.data?.count || 0;
    },
    async clear({collection}) {
        await runPromise('run', `DROP TABLE ${collection}`);
        tablesCreated.delete(collection);
        return true;
    },
    async filter({collection, callbackFn, thisArg}) {
        const result = await handlers.getAll({collection});
        return memoizedRun({array: result, ...thisArg}, `array.filter(${callbackFn})`)
    },
    async find({collection, callbackFn, thisArg}) {


        const result = await handlers.getAll({collection});
        return memoizedRun({array: result, ...thisArg}, `array.find(${callbackFn})`)
    },
    async map({collection, callbackFn, thisArg}) {
        const result = await handlers.getAll({collection});
        return memoizedRun({array: result, ...thisArg}, `array.map(${callbackFn})`)
    }
}

export const opHandlers = new Proxy(handlers, {
    get(target, prop, receiver) {
        return async ({collection, ...params}) => {
            await ensureTable(collection);
            return Reflect.get(target, prop, receiver)({collection, ...params});
        }
    },
})