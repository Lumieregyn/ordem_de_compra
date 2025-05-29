const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Lista todos os fornecedores registrados na Tiny ERP via API v3
 * Retorna um array de objetos com no mínimo: id, nome
 */
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
          tipo: 'fornecedor',
          page,
          size: pageSize
        }
      });

      const data = response.data;

      const pageData = data._embedded?.contatos || [];
      fornecedores.push(...pageData);

      const totalPages = data.page?.totalPages || 1;
      if (page >= totalPages) break;
      page++;
    }

    console.log(`📦 ${fornecedores.length} fornecedores carregados da Tiny`);
    return fornecedores;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.response?.data || err.message);
    return [];
  }
}

module.exports = { listarTodosFornecedores };
