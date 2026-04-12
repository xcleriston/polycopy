var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Datastore from '@seald-io/nedb';
import * as path from 'path';
import { getDbDir } from '../config/db';
// Cache datastores to avoid creating duplicates
const datastoreCache = new Map();
const getDatastore = (name) => {
    if (datastoreCache.has(name))
        return datastoreCache.get(name);
    const ds = new Datastore({ filename: path.join(getDbDir(), `${name}.db`), autoload: true });
    datastoreCache.set(name, ds);
    return ds;
};
// Wrapper that provides a mongoose-like API over NeDB
const createModel = (collectionName) => {
    const ds = getDatastore(collectionName);
    return {
        // Find one document
        findOne(query) {
            return { exec: () => ds.findOneAsync(query) };
        },
        // Find multiple documents
        find(query = {}) {
            return {
                exec: () => ds.findAsync(query),
                sort: (sortObj) => ({
                    exec: () => ds.findAsync(query).then(docs => docs.sort((a, b) => {
                        for (const [key, dir] of Object.entries(sortObj)) {
                            if (a[key] !== b[key])
                                return dir * (a[key] > b[key] ? 1 : -1);
                        }
                        return 0;
                    })),
                }),
            };
        },
        // Update one document
        updateOne(query, update) {
            return {
                exec: () => ds.updateAsync(query, update, {}),
            };
        },
        // Update many documents
        updateMany(query, update) {
            return ds.updateAsync(query, update, { multi: true })
                .then((result) => ({ modifiedCount: typeof result === 'number' ? result : result.numAffected || 0 }));
        },
        // Find one and update (with upsert)
        findOneAndUpdate(query, update, options = {}) {
            return ds.updateAsync(query, { $set: update }, { upsert: options.upsert || false });
        },
        // Count documents
        countDocuments() {
            return ds.countAsync({});
        },
        // Save a new document (constructor-like pattern)
        save(doc) {
            return __awaiter(this, void 0, void 0, function* () {
                return ds.insertAsync(doc);
            });
        },
    };
};
// Factory: create a "new document" that can be saved
const createDocumentFactory = (collectionName) => {
    const model = createModel(collectionName);
    const factory = (data) => {
        return Object.assign(Object.assign({}, data), { save: () => model.save(data), toObject: () => (Object.assign({}, data)) });
    };
    // Attach static methods to the factory
    Object.assign(factory, model);
    return factory;
};
const getUserPositionModel = (walletAddress) => {
    return createModel(`user_positions_${walletAddress}`);
};
const getUserActivityModel = (walletAddress) => {
    return createDocumentFactory(`user_activities_${walletAddress}`);
};
export { getUserActivityModel, getUserPositionModel };
