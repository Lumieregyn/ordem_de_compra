const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tiny';
const dbName = process.env.MONGODB_DB || 'tiny';
const collectionName = 'produtos';

let cachedClient = null;
let cachedDb = null;

async function connectToMongo() {
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await cachedClient.connect();
    cachedDb = cachedClient.db(dbName);
    console.log('✅ Conectado ao MongoDB');
  }
  return cachedDb;
}

async function getProdutosCollection() {
  const db = await connectToMongo();
  return db.collection(collectionName);
}

module.exports = { getProdutosCollection };
