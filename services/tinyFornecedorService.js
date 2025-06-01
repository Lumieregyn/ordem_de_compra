const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;

// Utilitário para aguardar (evita 429)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function listarTodosFornecedores() {
  const fornecedores = [];
  const maxPaginas = 10; // limite de segurança
  const delayEntreRequisicoes = 800; // em milissegundos

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    try {
      const url = `${BASE_URL}?token=${API_TOKEN}&formato=json&pagina=${pagina}&nome=FORNECEDOR`;
      const response = await axios.get(url);
      const lista = response.data?.retorno?.fornecedores || [];

      if (lista.length === 0) break; // fim da lista

      lista.forEach(item => {
        if (item?.fornecedor) {
          fornecedores.push(item.fornecedor);
        }
      });

      // Verifica se é a última página
      const ultimaPagina = response.data?.retorno?.pagina?.ultima === "true";
      if (ultimaPagina) break;

      await delay(delayEntreRequisicoes);
    } catch (error) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, error.response?.data || error.message);
      break;
    }
  }

  console.log(`[listarTodosFornecedores] Total retornado: ${fornecedores.length}`);
  return fornecedores;
}

module.exports = {
  listarTodosFornecedores
};
