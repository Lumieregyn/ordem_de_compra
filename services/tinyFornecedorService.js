const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Lista todos os contatos da Tiny com o tipo "fornecedor".
 * Retorna um array com objetos { id, nome }.
 */
async function listarFornecedoresTiny() {
  try {
    const token = getAccessToken();
    const fornecedores = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const resp = await axios.get(`https://api.tiny.com.br/api2/contatos`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          offset,
          limit
        }
      });

      const contatos = resp.data?.data?.itens || [];

      // Se não houver contatos, encerra a paginação
      if (contatos.length === 0) break;

      for (const contato of contatos) {
        const tipos = contato.tipos || [];

        if (tipos.includes('fornecedor')) {
          fornecedores.push({
            id: contato.codigo, // ou contato.id se preferir
            nome: contato.nome?.trim()?.toUpperCase()
          });
        }
      }

      offset += limit;
    }

    console.log(`📦 ${fornecedores.length} fornecedores identificados`);
    return fornecedores;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores da Tiny:', err.response?.data || err.message);
    return [];
  }
}

module.exports = {
  listarFornecedoresTiny
};
