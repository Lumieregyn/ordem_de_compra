const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Retorna a lista de fornecedores ativos cadastrados na Tiny.
 * Assumimos que fornecedores são contatos com tag ou nome associado à marca.
 */
async function listarFornecedoresTiny() {
  const token = getAccessToken();
  if (!token) {
    console.warn('⚠️ Token da Tiny não encontrado.');
    return [];
  }

  const fornecedores = [];
  let pagina = 1;
  const tamanhoPagina = 50;

  try {
    while (true) {
      const resp = await axios.get('https://erp.tiny.com.br/public-api/v3/contatos', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          pagina,
          tamanhoPagina
        }
      });

      const itens = resp.data?.itens || [];
      if (itens.length === 0) break;

      for (const item of itens) {
        const contato = item;
        // Aqui você pode filtrar fornecedores por regra específica (tags, nomes, etc.)
        fornecedores.push({
          id: contato.id,
          nome: contato.nome
        });
      }

      pagina++;

      // Delay para evitar 429
      await new Promise(res => setTimeout(res, 1000));
    }

    console.log(`📦 ${fornecedores.length} fornecedores carregados da Tiny`);
    return fornecedores;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores da Tiny:', err.response?.data || err.message);
    return [];
  }
}

module.exports = {
  listarFornecedoresTiny
};
