const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Lista todos os produtos da Tiny usando a API v3.
 * Retorna: [{ id, sku, marca }]
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

      // Delay para evitar erro 429
      await new Promise(res => setTimeout(res, 1000));
    }

    console.log(`📦 ${produtos.length} produtos carregados da Tiny`);
    return produtos;
  } catch (err) {
    console.error('❌ Erro ao buscar produtos da Tiny:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Consulta um único produto pelo ID na API v3 da Tiny
 */
async function getProdutoFromTinyV3(produtoId) {
  const token = getAccessToken();
  if (!token) {
    console.warn('⚠️ Token da Tiny não encontrado.');
    return null;
  }

  try {
    const resp = await axios.get(`https://erp.tiny.com.br/public-api/v3/produtos/${produtoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return resp.data;
  } catch (err) {
    console.error(`❌ Erro ao buscar produto ID ${produtoId}:`, err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  listarProdutosTiny,
  getProdutoFromTinyV3
};
