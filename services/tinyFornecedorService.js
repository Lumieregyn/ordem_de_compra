const axios = require('axios');
const { getAccessToken } = require('./tokenService');

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
      console.log(`🔄 Buscando fornecedores - Página ${pagina}`);

      const resp = await axios.get('https://erp.tiny.com.br/public-api/v3/contatos', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          pagina,
          tamanhoPagina
        }
      });

      if (!resp.data || !Array.isArray(resp.data.itens)) {
        console.warn('⚠️ Estrutura inesperada no retorno da API de fornecedores:', resp.data);
        break;
      }

      const itens = resp.data.itens;
      if (itens.length === 0) break;

      for (const item of itens) {
        fornecedores.push({
          id: item.id,
          nome: item.nome
        });
      }

      pagina++;

      // ⏱️ Delay para evitar erro 429
      await new Promise(res => setTimeout(res, 1000));

      // 🔍 Remover este if para modo completo
      if (pagina > 3) break; // ⚠️ LIMITADOR DE TESTE — remova em produção
    }

    console.log(`✅ ${fornecedores.length} fornecedores carregados da Tiny`);
    return fornecedores;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores da Tiny:', err.response?.data || err.message);
    return [];
  }
}

module.exports = {
  listarFornecedoresTiny
};
