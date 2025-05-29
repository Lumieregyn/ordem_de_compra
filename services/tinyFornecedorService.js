const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Lista todos os contatos da Tiny classificados como fornecedores.
 * Retorna: [{ id, nome }]
 */
async function listarTodosFornecedores() {
  const token = getAccessToken();
  if (!token) {
    console.warn('⚠️ Token de acesso ausente. Faça a autenticação via /auth e /callback.');
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
          page,
          size: pageSize
        }
      });

      const contatos = response.data?._embedded?.contatos || [];

      // 🔍 Filtrar apenas os fornecedores
      const fornecedoresPagina = contatos.filter(contato => {
        const tipo = contato?.tipo?.toLowerCase?.() || '';
        const tags = contato?.tags?.map(t => t.toLowerCase()) || [];

        return tipo.includes('fornecedor') || tags.includes('fornecedor');
      });

      fornecedores.push(...fornecedoresPagina);

      const totalPages = response.data?.page?.totalPages || 1;
      if (page >= totalPages) break;
      page++;
    }

    console.log(`📦 ${fornecedores.length} fornecedores identificados`);
    return fornecedores.map(f => ({
      id: f.id || f.codigo, // fallback para campo 'codigo' se 'id' não vier
      nome: f.nome?.trim()
    }));

  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.response?.data || err.message);
    return [];
  }
}

module.exports = { listarTodosFornecedores };
