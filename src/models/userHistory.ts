import Datastore from '@seald-io/nedb';
import * as path from 'path';
import { getDbDir } from '../config/db';

// Cache datastores to avoid creating duplicates
const datastoreCache: Map<string, Datastore> = new Map();

const getDatastore = (name: string): Datastore => {
    if (datastoreCache.has(name)) return datastoreCache.get(name)!;
    const ds = new Datastore({ filename: path.join(getDbDir(), `${name}.db`), autoload: true });
    datastoreCache.set(name, ds);
    return ds;
};

// Wrapper that provides a mongoose-like API over NeDB
const createModel = (collectionName: string) => {
    const ds = getDatastore(collectionName);

    return {
        // Find one document
        findOne(query: Record<string, unknown>) {
            return { exec: () => ds.findOneAsync(query) };
        },
        // Find multiple documents
        find(query: Record<string, unknown> = {}) {
            return {
                exec: () => ds.findAsync(query),
                sort: (sortObj: Record<string, number>) => ({
                    exec: () => ds.findAsync(query).then(docs =>
                        docs.sort((a: any, b: any) => {
                            for (const [key, dir] of Object.entries(sortObj)) {
                                if (a[key] !== b[key]) return dir * (a[key] > b[key] ? 1 : -1);
                            }
                            return 0;
                        })
                    ),
                }),
            };
        },
        // Update one document
        updateOne(query: Record<string, unknown>, update: Record<string, unknown>) {
            return {
                exec: () => ds.updateAsync(query, update, {}),
            };
        },
        // Update many documents
        updateMany(query: Record<string, unknown>, update: Record<string, unknown>) {
            return ds.updateAsync(query, update, { multi: true })
                .then((result) => ({ modifiedCount: typeof result === 'number' ? result : (result as any).numAffected || 0 }));
        },
        // Find one and update (with upsert)
        findOneAndUpdate(query: Record<string, unknown>, update: Record<string, unknown>, options: { upsert?: boolean } = {}) {
            return ds.updateAsync(query, { $set: update }, { upsert: options.upsert || false });
        },
        // Count documents
        countDocuments() {
            return ds.countAsync({});
        },
        // Save a new document (constructor-like pattern)
        async save(doc: Record<string, unknown>) {
            return ds.insertAsync(doc);
        },
    };
};

// Factory: create a "new document" that can be saved
const createDocumentFactory = (collectionName: string) => {
    const model = createModel(collectionName);
    const factory = (data: Record<string, unknown>) => {
        return {
            ...data,
            save: () => model.save(data),
            toObject: () => ({ ...data }),
        };
    };
    // Attach static methods to the factory
    Object.assign(factory, model);
    return factory as typeof factory & ReturnType<typeof createModel>;
};

const getUserPositionModel = (walletAddress: string) => {
    return createModel(`user_positions_${walletAddress}`);
};

const getUserActivityModel = (walletAddress: string) => {
    return createDocumentFactory(`user_activities_${walletAddress}`);
};

export { getUserActivityModel, getUserPositionModel };
