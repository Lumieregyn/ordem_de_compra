const axios = require('axios');

let cachedToken = null;
let tokenExpiraEm = null;

/**
 * Obtém um access_token válido da Tiny usando o refresh_token.
 * Faz cache automático enquanto o token estiver válido.
 * @returns {Promise<string>} token de acesso válido
 */
async function getAccessToken() {
  // Se o token atual ainda é válido, retorna ele
  if (cachedToken && tokenExpiraEm && Date.now() < tokenExpiraEm) {
    return cachedToken;
  }

  const client_id = process.env.CLIENT_ID;
  const client_secret = process.env.CLIENT_SECRET;
  const redirect_uri = process.env.REDIRECT_URI;
  const refresh_token = process.env.REFRESH_TOKEN;

  if (!client_id || !client_secret || !redirect_uri || !refresh_token) {
    throw new Error('Variáveis de ambiente OAuth2 incompletas');
  }

  const body = {
    grant_type: 'refresh_token',
    refresh_token,
    client_id,
    client_secret,
    redirect_uri,
  };

  try {
    const response = await axios.post(
      'https://erp.tiny.com.br/oauth/token',
      body,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const { access_token, expires_in } = response.data;

    // Salva no cache com tempo de expiração
    cachedToken = access_token;
    tokenExpiraEm = Date.now() + expires_in * 1000;

    console.log('[OAuth2 ✅] Novo token obtido da Tiny');
    return access_token;
  } catch (error) {
    console.error('[OAuth2 ❌] Erro ao obter token da Tiny:', error.response?.data || error.message);
    throw new Error('Falha ao obter token da Tiny');
  }
}

module.exports = { getAccessToken };
