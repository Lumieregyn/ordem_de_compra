// services/fornecedorService.js
const axios = require('axios');
const qs = require('querystring');
const { getAccessToken } = require('./tokenService');

const V3_BASE = process.env.TINY_V3_BASE_URL || 'https://api.tiny.com.br/public-api/v3';
const V2_BASE = process.env.TINY_V2_BASE_URL || 'https://api.tiny.com.br/api2';
const DEFAULT_DELAY_MS = Number(process.env.FORNECEDOR_REQUEST_DELAY_MS || 250);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const isPJ = (t) => String(t || '').trim().toUpperCase() === 'J';
const isFornecedorPadrao = (nome) =>
  typeof nome === 'string' && nome.trim().toUpperCase().startsWith('FORNECEDOR ');

async function with429Retry(fn, { maxRetries = 3, baseDelay = 500 } = {}) {
  let attempt = 0;
  // exponencial com jitter leve
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const delay = Math.round(baseDelay * Math.pow(2, attempt) * (1 + Math.random() * 0.25));
        console.warn(`[fornecedorService] 429 recebido. Retry #${attempt + 1} em ${delay}ms`);
        await sleep(delay);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

// ---------------- V3 ----------------
async function listarFornecedoresV3({ limit = 100 } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Token OAuth2 ausente para V3.');

  const headers = { Authorization: `Bearer ${token}` };
  const fornecedores = new Map();
  let page = 1;

  while (true) {
    const url = `${V3_BASE}/contatos`;
    const params = {
      page,
      limit,
      tipo: 'J',            // filtro server-side quando suportado
      nome: 'FORNECEDOR',   // prefixo; reforçamos client-side
    };

    const resp = await with429Retry(() => axios.get(url, { headers, params }));
    const payload = resp.data;

    // Estruturas que já vi: itens / data / contacts
    const itens =
      payload?.itens ||
      payload?.data ||
      payload?.contacts ||
      payload ||
      [];

    const lista = Array.isArray(itens) ? itens : [];
    if (lista.length === 0) break;

    for (const raw of lista) {
      const id = raw.id ?? raw.ID ?? raw.codigo ?? raw.idCadastro;
      const nome = raw.nome ?? raw.razaoSocial ?? raw.name;
      const tipoPessoa = raw.tipoPessoa ?? raw.tipo_pessoa ?? raw.pessoa ?? raw.type;

      if (!id || !nome) continue;
      if (!isPJ(tipoPessoa)) continue;
      if (!isFornecedorPadrao(nome)) continue;

      const {
        id: _i, ID: _I, codigo, idCadastro, name,
        razaoSocial, razaosocial, tipo_pessoa, pessoa, type,
        ...resto
      } = raw;

      fornecedores.set(String(id), { id: String(id), nome, tipoPessoa: 'J', ...resto });
    }

    if (lista.length < limit) break; // última página
    page++;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(fornecedores.values());
}

// ---------------- V2 (fallback) ----------------
async function listarFornecedoresV2({ pageSize = 100 } = {}) {
  const token = process.env.TINY_API_TOKEN;
  if (!token) throw new Error('TINY_API_TOKEN ausente para V2.');

  const fornecedores = new Map();
  let pagina = 1;

  while (true) {
    const url = `${V2_BASE}/fornecedores.pesquisa.php`;
    const body = qs.stringify({
      token,
      formato: 'json',
      pagina,
      nome: 'FORNECEDOR ', // busca ampla por prefixo
    });

    const resp = await with429Retry(() =>
      axios.post(url, body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    );

    const lista = resp.data?.retorno?.fornecedores || [];
    if (lista.length === 0) break;

    for (const item of lista) {
      const f = item?.fornecedor || item;
      const id = f?.id ?? f?.codigo ?? f?.idCadastro;
      const nome = f?.nome ?? f?.razaoSocial;
      const tipoPessoa = f?.tipoPessoa ?? f?.tipo_pessoa ?? f?.pessoa;

      if (!id || !nome) continue;
      if (!isPJ(tipoPessoa)) continue;
      if (!isFornecedorPadrao(nome)) continue;

      const { id: _i, codigo, idCadastro, razaoSocial, tipo_pessoa, pessoa, ...resto } = f || {};
      fornecedores.set(String(id), { id: String(id), nome, tipoPessoa: 'J', ...resto });
    }

    // heurística de parada: quando a API não preencher total/última
    if (lista.length < pageSize) break;

    pagina++;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(fornecedores.values());
}

// ---------------- Unificado ----------------
async function listarTodosFornecedoresUnificado(opts = {}) {
  try {
    const v3 = await listarFornecedoresV3(opts);
    if (v3?.length) return v3;
    console.warn('[fornecedorService] V3 sem resultados; tentando V2…');
  } catch (e) {
    console.warn(`[fornecedorService] Falha V3 → Fallback V2. Motivo: ${e?.message || e}`);
  }

  const v2 = await listarFornecedoresV2(opts); // lança em erro crítico
  return v2;
}

module.exports = {
  listarTodosFornecedoresUnificado,
  // expor internals para debug/teste opcional
  _internals: { listarFornecedoresV3, listarFornecedoresV2 }
};
