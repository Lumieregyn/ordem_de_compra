const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const BASE_URL = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Busca um produto específico pelo ID na API Tiny V3.
 * @param {number} idProduto 
 * @returns {Promise<Object|null>}
 */
async function getProdutoFromTinyV3(idProduto) {
  const token = await getAccessToken();
  if (!token) throw new Error('Token de acesso indisponível');

  const url = `${BASE_URL}/produtos/${idProduto}`;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const produto = response.data?.produto;
    if (!produto) {
      console.warn(`⚠️ Produto ID ${idProduto} não encontrado`);
      return null;
    }

    return produto;
  } catch (error) {
    console.error(`❌ Erro ao buscar produto ${idProduto}:`, error.message);
    return null;
  }
}

module.exports = {
  getProdutoFromTinyV3
};
