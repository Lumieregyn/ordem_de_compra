const axios = require("axios");
const qs = require("querystring");
const tokenService = require("./tokenService"); // deve exportar getAccessToken()

const DEFAULT_DELAY_MS = Number(process.env.FORNECEDOR_REQUEST_DELAY_MS || 200);
const V3_BASE = process.env.TINY_V3_BASE_URL || "https://api.tiny.com.br/api/v3";
const V2_BASE = process.env.TINY_V2_BASE_URL || "https://api.tiny.com.br/api2";

// ---------- Utilidades ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isFornecedorPadrao(nome) {
  if (!nome || typeof nome !== "string") return false;
  return nome.trim().toUpperCase().startsWith("FORNECEDOR ");
}

function isPessoaJuridica(tipoPessoa) {
  if (!tipoPessoa) return false;
  return String(tipoPessoa).trim().toUpperCase() === "J";
}

async function with429Retry(fn, { maxRetries = 3, baseDelay = 500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // exponencial
        await sleep(delay);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

// ---------- Listagem via API V3 ----------
async function listarV3({ pageSize = 100 } = {}) {
  const accessToken = await tokenService.getAccessToken(); // deve lançar se falhar
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Alguns ambientes usam 'suppliers' ou 'contacts'.
  // Na Tiny v3, o recurso costuma ser 'contacts' com tipo fornecedor,
  // mas manteremos 'fornecedores' por compatibilidade do seu projeto.
  const endpointCandidates = [
    `${V3_BASE}/fornecedores`,
    `${V3_BASE}/contacts`,
    `${V3_BASE}/cadastros/fornecedores`, // fallback de naming, caso exista
  ];

  // Vamos tentar o primeiro que responder 2xx.
  let chosenEndpoint = null;
  for (const url of endpointCandidates) {
    try {
      await with429Retry(() =>
        axios.get(url, {
          headers,
          params: { limit: 1, page: 1 },
        })
      );
      chosenEndpoint = url;
      break;
    } catch (e) {
      // Ignora e tenta o próximo
    }
  }
  if (!chosenEndpoint) {
    throw new Error(
      "Tiny API v3 indisponível para listagem de fornecedores (nenhum endpoint candidato respondeu 2xx)."
    );
  }

  const fornecedoresMap = new Map();
  let page = 1;

  while (true) {
    const resp = await with429Retry(() =>
      axios.get(chosenEndpoint, {
        headers,
        params: {
          limit: pageSize,
          page,
          // Tentativa de filtros server-side (nem sempre suportados; filtramos client-side também)
          tipoPessoa: "J",
          nome: "FORNECEDOR", // filtro amplo; client-side garante prefixo
        },
      })
    );

    // Estruturas possíveis: { data: { items: [], total, page, ... } } ou { data: [] }
    const payload = resp.data;
    const items =
      payload?.items ||
      payload?.data ||
      payload?.fornecedores ||
      payload?.contacts ||
      payload;

    const lista = Array.isArray(items) ? items : [];

    // Normaliza e filtra (prefixo "FORNECEDOR " + PJ)
    for (const raw of lista) {
      // Tenta mapear campos comuns
      const id = raw.id ?? raw.ID ?? raw.idCadastro ?? raw.codigo;
      const nome = raw.nome ?? raw.name ?? raw.razaoSocial ?? raw.razaosocial;
      const tipoPessoa =
        raw.tipoPessoa ??
        raw.tipo_pessoa ??
        raw.pessoa ??
        raw.tipo ??
        raw.type ??
        raw?.document?.tipoPessoa;

      if (!id) continue;

      if (isPessoaJuridica(tipoPessoa) && isFornecedorPadrao(nome)) {
        // Mantém tudo que vier no objeto original como ...resto
        const { id: _i, ID: _I, idCadastro, codigo, name, razaoSocial, razaosocial, tipo_pessoa, pessoa, type, ...resto } =
          raw || {};
        fornecedoresMap.set(String(id), {
          id: String(id),
          nome,
          tipoPessoa: "J",
          ...resto,
        });
      }
    }

    // Heurística de paginação: se vier menos que pageSize, acabou
    if (lista.length < pageSize) break;

    page += 1;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(fornecedoresMap.values());
}

// ---------- Listagem via API V2 (fallback) ----------
async function listarV2({ pageSize = 100 } = {}) {
  const token = process.env.TINY_API_TOKEN;
  if (!token) {
    throw new Error(
      "TINY_API_TOKEN não definido para fallback da API v2 (fornecedores.pesquisa.php)."
    );
  }

  const url = `${V2_BASE}/fornecedores.pesquisa.php`;
  const fornecedoresMap = new Map();
  let pagina = 1;

  while (true) {
    const params = {
      token,
      formato: "json",
      pagina,
      // Filtros comuns da v2. Nem todos os ambientes têm todos esses nomes de campos:
      // Usamos 'nome' amplo e filtramos client-side pelo prefixo.
      nome: "FORNECEDOR", // busca ampla
      // Campos alternativos que alguns ambientes aceitam:
      // tipo: 'J', tipo_pessoa: 'J'
    };

    const resp = await with429Retry(() =>
      axios.post(url, qs.stringify(params), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );

    const data = resp?.data;

    // Estrutura típica v2: { retorno: { status: 'OK', fornecedores: [ { fornecedor: {...} } ], ... } }
    const retorno = data?.retorno;
    const listaBruta =
      retorno?.fornecedores ||
      retorno?.cadastros ||
      retorno?.itens ||
      retorno?.dados;

    const lista = Array.isArray(listaBruta) ? listaBruta : [];

    // Extrai "fornecedor" interno quando presente
    const normalizados = lista.map((item) => item?.fornecedor || item).filter(Boolean);

    // Normaliza e filtra (prefixo + PJ)
    let adicionados = 0;
    for (const raw of normalizados) {
      const id = raw.id ?? raw.ID ?? raw.codigo ?? raw.idCadastro;
      const nome = raw.nome ?? raw.razaoSocial ?? raw.razaosocial;
      const tipoPessoa =
        raw.tipoPessoa ?? raw.tipo_pessoa ?? raw.pessoa ?? raw.tipo ?? raw.type;

      if (!id) continue;

      if (isPessoaJuridica(tipoPessoa) && isFornecedorPadrao(nome)) {
        const {
          id: _i,
          ID: _I,
          codigo,
          idCadastro,
          razaoSocial,
          razaosocial,
          tipo_pessoa,
          pessoa,
          type,
          ...resto
        } = raw || {};
        if (!fornecedoresMap.has(String(id))) {
          fornecedoresMap.set(String(id), {
            id: String(id),
            nome,
            tipoPessoa: "J",
            ...resto,
          });
          adicionados += 1;
        }
      }
    }

    // Heurística de parada:
    // - Se a página não trouxe nenhum item útil, encerra.
    // - Ou se a contagem de retornos for menor que pageSize (quando a API respeita paginação).
    const totalRetornado = normalizados.length;
    if (adicionados === 0 && totalRetornado === 0) break;
    if (totalRetornado < pageSize) break;

    pagina += 1;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(fornecedoresMap.values());
}

// ---------- Orquestrador Unificado ----------
async function listarTodosFornecedoresUnificado(options = {}) {
  // 1) Tenta V3
  try {
    const v3 = await listarV3(options);
    return v3;
  } catch (e) {
    console.warn(
      `[fornecedorService] Falha na API v3, iniciando fallback v2. Motivo: ${e?.message || e}`
    );
  }

  // 2) Fallback V2
  try {
    const v2 = await listarV2(options);
    return v2;
  } catch (e2) {
    console.error(
      `[fornecedorService] Falha também na API v2. Motivo: ${e2?.message || e2}`
    );
    throw new Error(
      "Não foi possível listar fornecedores pela API v3 nem pela v2."
    );
  }
}

module.exports = {
  listarTodosFornecedoresUnificado,
  // Exporta também as funções específicas para testes/diagnósticos, se desejar:
  _internals: { listarV3, listarV2, sleep, isFornecedorPadrao, isPessoaJuridica },
};
