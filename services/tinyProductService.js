const axios = require('axios');
const { getAccessToken } = require('./tokenService');

// 📦 Lista paginada de produtos da Tiny
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
      if (pagina > 3) break; // ⚠️ LIMITADOR DE TESTE — remova em produção
    }

    console.log(`✅ ${produtos.length} produtos carregados da Tiny`);
    return produtos;
  } catch (err) {
    console.error('❌ Erro ao buscar produtos da Tiny:', err.response?.data || err.message);
    return [];
  }
}

// 🔍 Consulta individual de produto com validação e fallback 401
async function getProdutoFromTinyV3(produtoId) {
  console.log(`🔍 Buscando produto ID: ${produtoId}`);

  let token = await getAccessToken();
  if (!token) {
    console.error('❌ Token OAuth2 não encontrado. Abortando requisição.');
    return null;
  }

  const url = `https://erp.tiny.com.br/public-api/v3/produtos/${produtoId}`;

  try {
    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const produto = resp.data?.produto || resp.data?.retorno?.produto;

    if (!produto) {
      console.warn(`⚠️ Produto não encontrado na resposta. ID: ${produtoId}`);
      console.dir(resp.data, { depth: null });
      return null;
    }

    const { sku, descricao, marca } = produto;

    if (!sku || !descricao || !marca?.nome) {
      console.warn(`⚠️ Produto incompleto detectado (ID: ${produtoId}). Dados ausentes:`);
      if (!sku) console.warn('- SKU ausente');
      if (!descricao) console.warn('- Descrição ausente');
      if (!marca?.nome) console.warn('- Marca ausente');
      console.dir(resp.data, { depth: null });
    }

    console.log(`✅ Produto ID ${produtoId} carregado com sucesso`);
    return produto;

  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.mensagem || err.message;

    if (status === 401) {
      console.warn(`⚠️ Token expirado. Tentando nova tentativa para produto ID ${produtoId}...`);

      token = await getAccessToken(true); // força renovação

      try {
        const retry = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const produto = retry.data?.produto || retry.data?.retorno?.produto;

        if (!produto) {
          console.warn(`⚠️ Produto não encontrado mesmo após renovação. ID: ${produtoId}`);
          console.dir(retry.data, { depth: null });
          return null;
        }

        console.log(`✅ Produto ID ${produtoId} carregado após renovação`);
        return produto;

      } catch (retryErr) {
        console.error(`❌ Falha mesmo após renovar token para produto ID ${produtoId}:`, retryErr.response?.data || retryErr.message);
        return null;
      }
    }

    console.error(`❌ Erro ao buscar produto ID ${produtoId} (Status: ${status}): ${msg}`);
    return null;
  }
}

module.exports = {
  listarProdutosTiny,
  getProdutoFromTinyV3
};
