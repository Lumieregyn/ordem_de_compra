const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Lista todos os produtos da Tiny usando a API v3.
 * Retorna array com id, sku e marca.
 */
async function listarProdutosTiny() {
  const token = getAccessToken();
  if (!token) {
    console.warn('⚠️ Token da Tiny não encontrado.');
    return [];
  }

  const produtos = [];
  let pagina = 1;
  const tamanhoPagina = 50;

  try {
    while (true) {
      const resp = await axios.get('https://erp.tiny.com.br/public-api/v3/produtos', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          pagina,
          tamanhoPagina
        }
      });

      const itens = resp.data?.itens || [];

      if (itens.length === 0) break;

      for (const item of itens) {
        produtos.push({
          id: item.id,
          sku: item.sku,
          marca: item.marca?.nome || null
        });
      }

      pagina++;
    }

    console.log(`📦 ${produtos.length} produtos carregados da Tiny`);
    return produtos;
  } catch (err) {
    console.error('❌ Erro ao buscar produtos da Tiny:', err.response?.data || err.message);
    return [];
  }
}

module.exports = {
  listarProdutosTiny
};
