const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

async function getProdutoFromTinyV3(produtoId) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Token de acesso v3 ausente. Rode /auth/callback primeiro.');
  }

  try {
    const response = await axios.get(`${TINY_API_V3_BASE}/produtos/${produtoId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('Erro ao buscar produto da API v3:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { getProdutoFromTinyV3 };
