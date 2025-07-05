const axios = require('axios');
const { getAccessToken } = require('./tokenService');

// 📦 Lista paginada de produtos da Tiny ERP
async function listarProdutosTiny() {
  let token;
  try {
    token = await getAccessToken();
    if (!token) {
      console.warn('⚠️ Token da Tiny não encontrado.');
      return [];
    }
  } catch (err) {
    console.error('❌ Erro ao obter token do Redis:', err.message);
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

// 🔍 Consulta individual de produto via ID no Tiny ERP (API v3) com retry para erro 429
async function getProdutoFromTinyV3(produtoId) {
  console.log(`🔍 Buscando produto ID: ${produtoId}`);

  let token;
  try {
    token = await getAccessToken();
    if (!token) {
      console.error('❌ Token OAuth2 não encontrado. Abortando requisição.');
      return null;
    }
  } catch (err) {
    console.error('❌ Erro ao obter token do Redis:', err.message);
    return null;
  }

  const url = `https://erp.tiny.com.br/public-api/v3/produtos/${produtoId}`;
  const maxTentativas = 5;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status !== 200) {
        console.error(`❌ Resposta inesperada da API (Status: ${response.status})`);
        return null;
      }

      console.log(`✅ Produto ID ${produtoId} carregado com sucesso`);
      return response.data;

    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data || error.message;

      if (status === 429 && tentativa < maxTentativas) {
        const espera = 500 * Math.pow(2, tentativa); // backoff exponencial
        console.warn(`⏳ Tentativa ${tentativa} falhou com 429. Aguardando ${espera}ms antes de tentar novamente.`);
        await new Promise((res) => setTimeout(res, espera));
      } else {
        console.error(`❌ Erro ao buscar produto ID ${produtoId} (Status: ${status}):`);
        console.error(msg);
        return null;
      }
    }
  }

  console.error(`❌ Erro 429 persistente após ${maxTentativas} tentativas ao buscar produto ${produtoId}`);
  return null;
}

module.exports = {
  listarProdutosTiny,
  getProdutoFromTinyV3
};
