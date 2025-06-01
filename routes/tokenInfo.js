const express = require('express');
const router = express.Router();
const { getAccessToken } = require('../services/tokenService');
const { createClient } = require('redis');

const redis = createClient({ url: process.env.REDIS_URL });
const TOKEN_KEY = 'tiny:token';

router.get('/', async (req, res) => {
  try {
    if (!redis.isOpen) await redis.connect();

    const raw = await redis.get(TOKEN_KEY);
    if (!raw) return res.status(404).json({ status: '❌ Token não encontrado no Redis' });

    const token = JSON.parse(raw);
    const agora = Date.now();
    const expiresAt = token.expires_at || 0;
    const tempoRestanteMs = expiresAt - agora;

    if (tempoRestanteMs <= 0) {
      return res.json({
        status: '⚠️ Token expirado',
        expira_em: '0s',
        expira_em_iso: new Date(expiresAt).toISOString()
      });
    }

    const minutos = Math.floor(tempoRestanteMs / 60000);
    const segundos = Math.floor((tempoRestanteMs % 60000) / 1000);

    res.json({
      status: '✅ Token válido',
      access_token: token.access_token.slice(0, 20) + '...', // parcial
      expira_em: `${minutos}min ${segundos}s`,
      expira_em_iso: new Date(expiresAt).toISOString()
    });

  } catch (err) {
    console.error('❌ Erro em /token/info:', err.message);
    res.status(500).json({ erro: 'Erro ao consultar token' });
  }
});

module.exports = router;
