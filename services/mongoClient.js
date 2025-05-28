const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGODB_DB || 'tiny';
const collectionName = 'produtos';

let cachedClient = null;
let cachedDb = null;

async function connectToMongo() {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  await client.connect();
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  console.log('✅ Conectado ao MongoDB');
  return db;
}

async function getProdutosCollection() {
  const db = await connectToMongo();
  return db.collection(collectionName);
}

module.exports = { getProdutosCollection };
