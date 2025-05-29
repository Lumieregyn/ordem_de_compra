const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

async function listarTodosFornecedores() {
  const token = getAccessToken();
  if (!token) {
    console.warn('⚠️ Token não encontrado. Rode /auth → /callback primeiro.');
    return [];
  }

  const fornecedores = [];
  let page = 1;
  const pageSize = 100;

  try {
    while (true) {
      const response = await axios.get(`${TINY_API_V3_BASE}/contatos`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          // tipo: 'fornecedor', ← ⚠️ REMOVIDO
          page,
          size: pageSize
        }
      });

      const pageData = response.data?._embedded?.contatos || [];
      fornecedores.push(...pageData);

      const totalPages = response.data?.page?.totalPages || 1;
      if (page >= totalPages) break;
      page++;
    }

    console.log(`📦 ${fornecedores.length} contatos carregados da Tiny`);

    return fornecedores;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.response?.data || err.message);
    return [];
  }
}

module.exports = { listarTodosFornecedores };
