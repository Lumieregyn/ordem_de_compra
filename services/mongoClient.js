const { MongoClient } = require('mongodb');

const mongoClient = new MongoClient(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let produtosCollection;

async function conectarMongo() {
  try {
    await mongoClient.connect();
    produtosCollection = mongoClient.db('ordens').collection('produtos');
    console.log('✅ [mongoClient] Conectado ao MongoDB');
  } catch (err) {
    console.error('❌ [mongoClient] Erro na conexão com MongoDB:', err);
    throw err;
  }
}

module.exports = {
  conectarMongo,
  getProdutosCollection: () => produtosCollection,
};
