const { createClient } = require('redis');
const axios = require('axios');

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', err => console.error('❌ Erro no Redis:', err));

const TOKEN_KEY = 'tiny:token';

// ⏱️ renova com antecedência (10 min)
const RENOVA_ANTES_MS = 10 * 60 * 1000;
// 🔁 tentativas de refresh com backoff
const MAX_TENTATIVAS_REFRESH = 3;
const BACKOFF_BASE_MS = 1500;

// evita tempestade de refresh em concorrência
let refreshPromise = null;

// lazy import p/ alerta WhatsApp (opcional)
let enviarWhatsappErro = null;
try {
  ({ enviarWhatsappErro } = require('./whatsAppService'));
} catch (_) { /* sem WhatsApp, segue sem alerta */ }

/** Conecta ao Redis se ainda não estiver conectado */
async function conectarRedis() {
  if (!redis.isOpen) await redis.connect();
}

/** Salva token no Redis e adiciona campos de expiração calculados */
async function salvarToken(tokenData) {
  await conectarRedis();

  // access_token
  const now = Date.now();
  const accessExpiresAt = now + (Number(tokenData.expires_in || 0) * 1000);

  // refresh_token (se o IdP enviar refresh_expires_in)
  let refreshExpiresAt = null;
  if (tokenData.refresh_expires_in != null) {
    refreshExpiresAt = now + (Number(tokenData.refresh_expires_in) * 1000);
  }

  const toSave = {
    ...tokenData,
    expires_at: accessExpiresAt,
    ...(refreshExpiresAt ? { refresh_expires_at: refreshExpiresAt } : {})
  };

  await redis.set(TOKEN_KEY, JSON.stringify(toSave));
  console.log('💾 Token salvo. expira_em:', new Date(accessExpiresAt).toISOString(),
    refreshExpiresAt ? `| refresh_expira_em: ${new Date(refreshExpiresAt).toISOString()}` : '');
}

/** Recupera token bruto do Redis (completo) */
async function lerToken() {
  await conectarRedis();
  const raw = await redis.get(TOKEN_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

/** Apaga o token do Redis (debug/forçar reauth) */
async function limparToken() {
  await conectarRedis();
  await redis.del(TOKEN_KEY);
}

/** Aguarda (ms) */
const delay = ms => new Promise(r => setTimeout(r, ms));

/** Renova o access_token usando o refresh_token (com backoff e rotação) */
async function renovarToken(tokenAtual) {
  if (!tokenAtual?.refresh_token) {
    console.error('❌ Sem refresh_token para renovar.');
    return null;
  }

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_REFRESH; tentativa++) {
    try {
      console.log(`🔄 Renovando access_token (tentativa ${tentativa}/${MAX_TENTATIVAS_REFRESH})...`);

      const response = await axios.post(
        'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          refresh_token: tokenAtual.refresh_token,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
          validateStatus: () => true,
        }
      );

      const ok = response.status >= 200 && response.status < 300 && response.data?.access_token;
      if (!ok) {
        console.warn('⚠️ Falha no refresh:', response.status, response.data);
        // se refresh_token inválido/expirado, não adianta tentar de novo
        if (response.status === 400 || response.status === 401) break;
      } else {
        // IMPORTANTE: alguns IdPs ROTACIONAM o refresh_token — sempre salve o dado inteiro
        await salvarToken(response.data);
        return response.data.access_token;
      }
    } catch (err) {
      console.warn(`⏳ Erro no refresh (tentativa ${tentativa}):`, err.message);
    }

    // backoff exponencial simples
    const espera = BACKOFF_BASE_MS * Math.pow(2, tentativa - 1);
    await delay(espera);
  }

  // chegou aqui = refresh falhou
  if (typeof enviarWhatsappErro === 'function') {
    try {
      await enviarWhatsappErro('❌ Tiny OAuth2: falha ao renovar o token. Acesse /auth para revalidar as credenciais.');
    } catch (_) {}
  }
  return null;
}

/**
 * Obtém o access_token válido:
 * - retorna o atual se faltar > RENOVA_ANTES_MS
 * - senão, executa (ou aguarda) um refresh com dedupe
 */
async function getAccessToken() {
  const token = await lerToken();
  if (!token) return null;

  const agora = Date.now();
  const expiraEm = token.expires_at || 0;

  // Se ainda falta bastante tempo, usa o atual
  if (agora < expiraEm - RENOVA_ANTES_MS) {
    return token.access_token;
  }

  // Caso contrário, renova — deduplicando concorrências
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const novo = await renovarToken(token);
      refreshPromise = null;
      return novo;
    })();
  }
  return await refreshPromise;
}

module.exports = {
  salvarToken,
  getAccessToken,
  lerToken,       // utilitário (debug)
  limparToken     // utilitário (debug)
};
