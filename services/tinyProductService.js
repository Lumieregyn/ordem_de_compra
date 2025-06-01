const axios = require('axios');
const { getAccessToken } = require('./tokenService');

async function listarProdutosTiny() {
  let token = await getAccessToken();
  if (!token) {
    console.warn('⚠️ Token da Tiny não encontrado.');
    return [];
  }

  const produtos = [];
  let pagina = 1;
  const tamanhoPagina = 50;

  try {
    while (true) {
      console.log(`🔄 Buscando produtos - Página ${pagina}`);

      const resp = await axios.get('https://erp.tiny.com.br/public-api/v3/produtos', {
        headers: { Authorization: `Bearer ${token}` },
        params: { pagina, tamanhoPagina }
      });

      if (!resp.data || !Array.isArray(resp.data.itens)) {
        console.warn('⚠️ Estrutura inesperada no retorno da API de produtos:', resp.data);
        break;
      }

      const itens = resp.data.itens;
      if (itens.length === 0) break;

      for (const item of itens) {
        produtos.push({
          id: item.id,
          sku: item.sku,
          marca: item.marca?.nome || null
        });
      }

      pagina++;
      await new Promise(res => setTimeout(res, 1000)); // ⏱️ Delay para evitar erro 429
      if (pagina > 3) break; // ⚠️ LIMITADOR DE TESTE
    }

    console.log(`✅ ${produtos.length} produtos carregados da Tiny`);
    return produtos;
  } catch (err) {
    console.error('❌ Erro ao buscar produtos da Tiny:', err.response?.data || err.message);
    return [];
  }
}

async function getProdutoFromTinyV3(produtoId) {
  let token = await getAccessToken();
  if (!token) {
    console.warn('⚠️ Token da Tiny não encontrado.');
    return null;
  }

  try {
    const resp = await axios.get(`https://erp.tiny.com.br/public-api/v3/produtos/${produtoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return resp.data?.retorno?.produto || null;
  } catch (err) {
    // Proteção extra: tentar renovar se for erro 401
    if (err.response?.status === 401) {
      console.warn(`⚠️ Token expirado. Tentando nova tentativa para produto ID ${produtoId}...`);
      token = await getAccessToken(true); // força renovação se sua função aceitar isso

      try {
        const retry = await axios.get(`https://erp.tiny.com.br/public-api/v3/produtos/${produtoId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        return retry.data?.retorno?.produto || null;
      } catch (retryErr) {
        console.error('❌ Mesmo após renovar token, falhou:', retryErr.response?.data || retryErr.message);
        return null;
      }
    }

    console.error(`❌ Erro ao buscar produto ID ${produtoId}:`, err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  listarProdutosTiny,
  getProdutoFromTinyV3
};
