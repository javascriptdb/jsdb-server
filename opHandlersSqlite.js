import sqlite3 from "sqlite3";
import {memoizedRun} from "./vm.js";
import _ from "lodash-es"
import {functionToWhere} from "./parser.js";

export const db = new sqlite3.Database(process.env.SQLITE_DATABASE_PATH || './database.sqlite');
db.run( 'PRAGMA journal_mode = WAL;' );
let preparedStatementMap = new Map();

export const uuid = () => {
    const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

    let autoId = ''

    for (let i = 0; i < 24; i++) {
        autoId += CHARS.charAt(
            Math.floor(Math.random() * CHARS.length)
        )
    }
    return autoId
}

const tablesCreated = new Map();

async function runPromise(cmd, sql, params) {
    return new Promise((resolve, reject) => {
        let statement;
        if(preparedStatementMap.has(sql)) {
            statement = preparedStatementMap.get(sql);
        } else {
            statement = db.prepare(sql);
            preparedStatementMap.set(sql, statement)
        }
        statement[cmd](params, function (error, data) {
            if (error) {
                reject(error)
            } else {
                resolve({statement: this, data})
            }
        })
    })
}

export async function forceTable(collection) {
    if (tablesCreated.has(safe(collection))) return;
    await runPromise('run', `CREATE TABLE IF NOT EXISTS ${collection} (id TEXT PRIMARY KEY, value JSONB)`)
    tablesCreated.set(collection, true);
}

export async function forceIndex(collection, index) {
    await forceTable(collection)
    try {
        const indexName = index.fields.join('_').replace(/\s+/g, ' ').trim()
        const columns = index.fields.map(field => {
            const parts = field.replace(/\s+/g, ' ').trim().split(' ')
            if (parts.length > 2) {
                throw new Error('Invalid field, must have form: path.to.property DESC');
            } else if (parts[1] !== undefined && !['ASC', 'DESC'].includes(parts[1])) {
                throw new Error('Invalid field, order should be ASC or DESC');
            }
            return `JSON_EXTRACT(value, '$.${safe(parts[0])}') ${safe(parts[1] || 'ASC')}`
        }).join(',')
        await runPromise('run', `CREATE UNIQUE INDEX IF NOT EXISTS '${indexName}' ON ${collection} (${columns})`)
    } catch (e) {
        console.error(e)
    }
}

function rowDataToObject(data) {
    return {id: data.id, ...JSON.parse(data.value)};
}

function rowsToObjects(rows) {
    return rows.map(rowDataToObject);
}

export const opHandlers = {
    async getAll({collection}) {
        await forceTable(collection);
        const result = await runPromise('all', `SELECT * FROM ${collection}`)
        return rowsToObjects(result.data || []);
    },
    async slice({collection, start, end}) {
        await forceTable(collection);
        const result = await runPromise('all', `SELECT * FROM ${collection} LIMIT $limit OFFSET $offset`, {
            $offset: start,
            $limit: end - start
        })
        return rowsToObjects(result.data || []);
    },
    async get({collection, id, path = []}) {
        await forceTable(collection);
        if (path.length > 0) {
            const result = await runPromise('get', `SELECT id, json_extract(value, '$.${safe(path.join('.'))}') as value FROM ${collection} WHERE id = $id`, {
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
        await forceTable(collection);
        const insertSegment = `INSERT INTO ${collection} (id,value) VALUES ($id,json($value))`;
        let result;
        if (path.length > 0) {
            // Make new object from path
            const object = _.set({}, path, value);
            result = await runPromise('run', `${insertSegment} ON CONFLICT (id) DO UPDATE SET value = json_set(value,'$.${safe(path.join('.'))}',json($nestedValue)) RETURNING *`, {
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
        await forceTable(collection);
        await this.set({collection, value});
        return await this.size({collection});
    },
    async delete({collection, id, path = []}) {
        await forceTable(collection);
        if (path.length > 0) {
            const result = await runPromise('run', `UPDATE ${collection} SET value = json_remove(value,'$.${safe(path.join('.'))}') WHERE id = $id`, {
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
        await forceTable(collection);
        const result = await runPromise('get', `SELECT EXISTS(SELECT id FROM ${collection} WHERE id = $id) as found`, {
            $id: id
        })
        return result?.data.found > 0;
    },
    async keys({collection}) {
        await forceTable(collection);
        const result = await runPromise('all', `SELECT id FROM ${collection}`)
        return result?.data?.map(r => r.id);
    },
    async size({collection}) {
        await forceTable(collection);
        const result = await runPromise('get', `SELECT COUNT(id) as count FROM ${collection}`)
        return result?.data?.count || 0;
    },
    async clear({collection}) {
        await forceTable(collection);
        await runPromise('run', `DROP TABLE ${collection}`);
        tablesCreated.delete(collection);
        return true;
    },
    async filter({collection, operations}) {
        await forceTable(collection);
        const lengthOp = operations.find(op => op.type === 'length');
        let query = `SELECT ${lengthOp?'COUNT(*) as count':'*'} FROM ${collection}`
        let queryParams = {};

        const where = operations.filter(op => op.type === 'filter').map(op => functionToWhere(op.data.callbackFn, op.data.thisArg)).join(' AND ');
        if(where) query += ` WHERE ${where} `

        const orderBy = operations.filter(op => op.type === 'orderBy').map(op => `json_extract(value,'$.${op.data.property}') ${op.data.order}`).join(' ');
        if(orderBy) query += ` ORDER BY ${orderBy} `

        const sliceOp = operations.find(op => op.type === 'slice');
        if(sliceOp) {
            query += ` LIMIT $limit OFFSET $offset `;
            queryParams.$offset = sliceOp?.data.start;
            queryParams.$limit = sliceOp?.data.end - sliceOp?.data.start;
        }

        if(lengthOp) {
            // Return without running map operation, doesn't make sense to waste time mapping and then counting.
            const result = await runPromise('get', query, queryParams)
            return result?.data?.count;
        } else {
            const result = await runPromise('all', query, queryParams)
            const mapOp = operations.find(op => op.type === 'map');
            const objects = rowsToObjects(result.data || []);
            if(mapOp) {
                return memoizedRun({array: objects, ...mapOp.data.thisArg}, `array.map(${mapOp.data.callbackFn})`)
            } else {
                return objects;
            }
        }
    },
    async find({collection, callbackFn, thisArg}) {
        await forceTable(collection);
        const result = await this.getAll({collection});
        return memoizedRun({array: result, ...thisArg}, `array.find(${callbackFn})`)
    },
    async map({collection, callbackFn, thisArg}) {
        await forceTable(collection);
        const result = await this.getAll({collection});
        return memoizedRun({array: result, ...thisArg}, `array.map(${callbackFn})`)
    }
}

function safe(string) {
    string.split('.').forEach(segment => {
        if(!/^\w+$/.test(segment)) throw new Error('Unsafe string. Only alphanumerical chars allowed.')
    })
    return string;
}