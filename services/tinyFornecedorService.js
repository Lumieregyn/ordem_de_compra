// services/tinyFornecedorService.js
const axios = require('axios');

const BASE_URL_V2 = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const API_TOKEN = process.env.TINY_API_TOKEN;

// Delay para evitar erro 429
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * >>> EXISTENTE NO SEU PROJETO <<<
 * Mantido para compatibilidade. (Sem alterações)
 */
async function listarTodosFornecedores() {
  const fornecedoresMap = new Map();
  const maxPaginas = 10;
  const delayEntreRequisicoes = 800;

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    try {
      const url = `${BASE_URL_V2}?token=${API_TOKEN}&formato=json&pagina=${pagina}&nome=FORNECEDOR%20`;
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

/**
 * NOVO: Busca direta na API v3 pelo padrão "FORNECEDOR <MARCA>"
 * - paginação correta (pagina / tamanhoPagina)
 * - filtra por tipo=J (Pessoa Jurídica)
 * - retorna match exato primeiro; se não, um candidato que contenha a marca
 */
async function buscarFornecedorPorMarcaV3(marca) {
  if (!marca) return null;

  // OBS: a v3 usa Bearer token OAuth2; aqui esperamos que você já esteja
  // usando middleware de token/bearer em outro ponto (ex: axios interceptor).
  // Caso não tenha, ajuste o header Authorization aqui conforme seu fluxo.

  let pagina = 1;
  const tamanhoPagina = 100;
  const termo = `FORNECEDOR ${marca}`.trim();

  while (true) {
    try {
      const { data } = await axios.get(`${V3_BASE}/contatos`, {
        headers: {
          // Se você tiver um getAccessToken(), pode injetar aqui:
          // Authorization: `Bearer ${await getAccessToken()}`,
        },
        params: {
          pagina,
          tamanhoPagina,
          tipo: 'J',
          nome: termo
        },
        validateStatus: () => true
      });

      const itens = Array.isArray(data?.itens) ? data.itens : [];
      if (itens.length === 0) break;

      const toContato = (x) => x?.contato || x;

      const exato = itens.map(toContato).find(c => c?.nome?.toUpperCase() === termo.toUpperCase());
      if (exato) return exato;

      const candidato = itens.map(toContato).find(c => c?.nome?.toUpperCase().includes(String(marca).toUpperCase()));
      if (candidato) return candidato;

      const total = Number(data?.totalRegistros || 0);
      const lidos = pagina * tamanhoPagina;
      if (lidos >= total) break;

      pagina++;
      await delay(300);
    } catch (e) {
      console.error(`[buscarFornecedorPorMarcaV3] Falha na página ${pagina}:`, e.response?.data || e.message);
      break;
    }
  }

  return null;
}

module.exports = {
  listarTodosFornecedores,
  buscarFornecedorPorMarcaV3
};
