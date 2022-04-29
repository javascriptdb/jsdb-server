import sqlite3 from "sqlite3";

const db = new sqlite3.Database('./database.sqlite');

// db.serialize(() => {
//     db.run("CREATE TABLE IF NOT EXISTS `tests` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `data` JSONB)");
//
//     const stmt = db.prepare("INSERT INTO lorem VALUES (?)");
//     for (let i = 0; i < 10; i++) {
//         stmt.run("Ipsum " + i);
//     }
//     stmt.finalize();
//
//     db.each("SELECT rowid AS id, info FROM lorem", (err, row) => {
//         console.log(row.id + ": " + row.info);
//     });
// });

// setTimeout(() => db.close(), 1000)
const tablesCreated = new Map();

async function runPromise(cmd,...args) {
    return new Promise((resolve, reject) => {
        db[cmd](...args, function (error, result) {
            if(error) {
                reject(error)
            } else {
                resolve({statement: this, result})
            }
        })
    })
}

async function syncModel(collection) {
    if (tablesCreated.has(collection)) return;
    await runPromise('run',`CREATE TABLE IF NOT EXISTS ${collection} (id INTEGER PRIMARY KEY AUTOINCREMENT, data JSONB)`)
    tablesCreated.set(collection, true);
}

const handlers = {
    async get({collection, id}) {
        const result = await runPromise('get',`SELECT * FROM ${collection} WHERE id = $id`, {
            $id: id,
        })
        return result;
    },
    async set({collection, id, data}) {
        const result = await runPromise('run',`INSERT INTO ${collection} (id,data) VALUES ($id,json($data)) ON CONFLICT (id) DO UPDATE SET data = $data`, {
            $id: id,
            $data: JSON.stringify(data)
        })
        return result;
    }
}

export const opHandlers = new Proxy(handlers, {
    get(target, prop, receiver) {
        return async ({collection, ...params}) => {
            await syncModel(collection);
            return Reflect.get(target, prop, receiver)({collection, ...params});
        }
    },
})