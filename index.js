require('dotenv').config();
const express = require('express');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const app = express();

app.get('/gerar-oc', (req, res) => {
    const resultado = gerarOrdemCompra();
    res.json(resultado);
});

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});
