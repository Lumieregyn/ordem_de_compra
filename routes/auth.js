const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { salvarToken } = require('../services/tokenService');

// Util: gera um state anti-CSRF por sessão simples (stateless)
function gerarState() {
  return crypto.randomBytes(16).toString('hex');
}

router.get('/auth', (req, res) => {
  const state = gerarState();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    // ✅ pede refresh de longo prazo (Keycloak/Tiny)
    scope: 'openid offline_access',
    // opcional: força tela de consentimento quando necessário
    // prompt: 'consent',
    state
  });

  res.redirect(
    `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?${params}`
  );
});

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código ausente');

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
    });

    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      body,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (!(response.status >= 200 && response.status < 300) || !response.data?.access_token) {
      console.error('❌ Erro no token:', response.status, response.data);
      return res.status(500).send('Token não retornado pela API');
    }

    // 🔁 IMPORTANTE: salve sempre a resposta inteira para rotacionar refresh_token
    await salvarToken(response.data);

    res.send('✅ Token salvo com sucesso no Redis. Pode fechar esta aba.');

  } catch (err) {
    console.error('❌ Erro no callback:', err.message);
    res.status(500).send('Erro ao salvar token');
  }
});

module.exports = router;
