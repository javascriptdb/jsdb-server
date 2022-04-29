import {DataTypes, Sequelize} from "sequelize";
const syncedModels = new Map();
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
});

async function syncModel(collection) {
    if(syncedModels.has(collection)) return;
    const model = sequelize.define(collection, {
        data: DataTypes.JSONB
    }, {
        tableName: collection
    });
    await model.sync();
    syncedModels.set(collection, model);
}

const handlers = {
    get({collection,id}) {
        return syncedModels.get(collection).findOne({
            where: {
                id
            },
            raw: true
        });
    },
    set({collection,id,data}) {
        return syncedModels.get(collection).upsert({
            id, data
        }, {
            returning: true
        });
    }
}

export const opHandlers = new Proxy(handlers, {
    get(target, prop, receiver) {
        return async ({collection,...params}) => {
            await syncModel(collection);
            return Reflect.get(target, prop, receiver)({collection,...params});
        }
    },
})