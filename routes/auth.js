const express = require('express');
const axios = require('axios');
const qs = require('qs');
const router = express.Router();

const { setAccessToken } = require('../services/tokenService');

const OIDC_BASE = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect';
const SCOPES = 'openid';

router.get('/auth', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    scope: SCOPES
  });
  res.redirect(`${OIDC_BASE}/auth?${params}`);
});

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código de autorização ausente');

  try {
    const resp = await axios.post(
      `${OIDC_BASE}/token`,
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    setAccessToken(resp.data.access_token);
    console.log(`✅ Token obtido; expira em ${resp.data.expires_in}s`);
    res.send('Autenticação concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao obter token:', err.response?.data || err.message);
    res.status(500).send('Erro ao obter token');
  }
});

router.get('/refresh', async (req, res) => {
  const refreshToken = process.env.REFRESH_TOKEN;
  if (!refreshToken) return res.status(400).send('Refresh token ausente');

  try {
    const resp = await axios.post(
      `${OIDC_BASE}/token`,
      qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    setAccessToken(resp.data.access_token);
    console.log(`🔄 Token renovado; expira em ${resp.data.expires_in}s`);
    res.send('Token renovado com sucesso');
  } catch (err) {
    console.error('❌ Erro ao renovar token:', err.response?.data || err.message);
    res.status(500).send('Erro ao renovar token');
  }
});

module.exports = router;
