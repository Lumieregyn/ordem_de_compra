// /auth/tokenService.js
const axios = require('axios');

let cachedToken = null;
let tokenExpiraEm = null;

async function getAccessToken() {
  // Se o token ainda é válido, retorna o cache
  if (cachedToken && tokenExpiraEm && Date.now() < tokenExpiraEm) {
    return cachedToken;
  }

  const client_id = process.env.CLIENT_ID;
  const client_secret = process.env.CLIENT_SECRET;
  const redirect_uri = process.env.REDIRECT_URI;
  const refresh_token = process.env.REFRESH_TOKEN; // você deve obter e armazenar esse token anteriormente

  const body = {
    grant_type: 'refresh_token',
    refresh_token,
    client_id,
    client_secret,
    redirect_uri,
  };

  try {
    const response = await axios.post('https://erp.tiny.com.br/oauth/token', body, {
      headers: { 'Content-Type': 'application/json' },
    });

    const { access_token, expires_in } = response.data;
    cachedToken = access_token;
    tokenExpiraEm = Date.now() + expires_in * 1000;

    return access_token;
  } catch (error) {
    console.error('[OAuth2 ❌] Falha ao obter token:', error.response?.data || error.message);
    throw new Error('Não foi possível obter o token de acesso da Tiny.');
  }
}

module.exports = { getAccessToken };
