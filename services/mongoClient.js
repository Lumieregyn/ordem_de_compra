const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017'; // Corrigido o nome da env
const dbName = process.env.MONGODB_DB || 'tiny';
const collectionName = 'produtos';

let client;
let db;

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await client.connect();
    db = client.db(dbName);
    console.log('✅ Conectado ao MongoDB');
  }
}

async function getProdutosCollection() {
  if (!db) {
    await connectToMongo();
  }
  return db.collection(collectionName);
}

module.exports = { getProdutosCollection };
