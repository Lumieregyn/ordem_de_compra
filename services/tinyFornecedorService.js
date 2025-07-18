const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;

// Delay para evitar erro 429
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function listarTodosFornecedores() {
  const fornecedoresMap = new Map();
  const maxPaginas = 10;
  const delayEntreRequisicoes = 800;

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    try {
      const url = `${BASE_URL}?token=${API_TOKEN}&formato=json&pagina=${pagina}&nome=FORNECEDOR%20`;
      const response = await axios.get(url);
      const lista = response.data?.retorno?.fornecedores || [];

      if (lista.length === 0) break;

      lista.forEach(item => {
        const f = item?.fornecedor;
        if (
          f?.id &&
          f?.nome?.toUpperCase().startsWith('FORNECEDOR ') &&
          f?.tipoPessoa === 'J'
        ) {
          fornecedoresMap.set(f.id, f); // evita duplicatas
        }
      });

      const ultimaPagina = response.data?.retorno?.pagina?.ultima === "true";
      if (ultimaPagina) break;

      await delay(delayEntreRequisicoes);
    } catch (error) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, error.response?.data || error.message);
      break;
    }
  }

  const fornecedores = Array.from(fornecedoresMap.values());
  console.log(`[listarTodosFornecedores] Total filtrado: ${fornecedores.length}`);
  return fornecedores;
}

module.exports = {
  listarTodosFornecedores
};
