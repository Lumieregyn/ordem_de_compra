// services/pinecone.js
const axios = require('axios');
const crypto = require('crypto');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_URL = 'https://lumiere-logs-ada-gqv3rnm.svc.aped-4627-b74a.pinecone.io';
const PINECONE_NAMESPACE = 'marcas'; // usar um namespace dedicado

const HEADERS = {
  'Api-Key': PINECONE_API_KEY,
  'Content-Type': 'application/json'
};

// Gera um ID consistente para a marca
function gerarIdParaMarca(marca) {
  return crypto.createHash('md5').update(marca.toLowerCase()).digest('hex');
}

// Consulta se a marca já está indexada
async function marcaExiste(marca) {
  const vectorId = gerarIdParaMarca(marca);

  try {
    const response = await axios.post(
      `${PINECONE_INDEX_URL}/vectors/fetch`,
      {
        ids: [vectorId],
        namespace: PINECONE_NAMESPACE
      },
      { headers: HEADERS }
    );

    return response.data?.vectors?.[vectorId] !== undefined;
  } catch (err) {
    console.error('Erro ao consultar Pinecone:', err.response?.data || err.message);
    return false; // fallback de segurança
  }
}

// Insere uma nova marca se ainda não estiver indexada
async function inserirMarca(marca) {
  const id = gerarIdParaMarca(marca);
  const vetorDummy = Array(1536).fill(0); // placeholder para dimensão obrigatória

  try {
    const existe = await marcaExiste(marca);
    if (existe) return false;

    await axios.post(
      `${PINECONE_INDEX_URL}/vectors/upsert`,
      {
        vectors: [
          {
            id,
            values: vetorDummy,
            metadata: { nome: marca }
          }
        ],
        namespace: PINECONE_NAMESPACE
      },
      { headers: HEADERS }
    );

    return true;
  } catch (err) {
    console.error('Erro ao inserir marca no Pinecone:', err.response?.data || err.message);
    return false;
  }
}

module.exports = {
  inserirMarca,
  marcaExiste
};
