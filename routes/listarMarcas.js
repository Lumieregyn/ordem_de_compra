app.get('/listar-marcas', async (req, res) => {
  const token = process.env.TINY_API_TOKEN;
  const marcasUnicas = new Set();
  let pagina = 1;
  let continuar = true;

  try {
    while (continuar) {
      console.log(`📦 Consultando página ${pagina} da API da Tiny...`);

      const response = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        null,
        {
          params: {
            token,
            formato: 'json',
            pagina
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const retorno = response.data?.retorno;
      if (!retorno || retorno.status !== 'OK') {
        console.error('❌ Erro na resposta da Tiny:', retorno?.erros || 'Resposta malformada');
        return res.status(500).json({ error: 'Erro na resposta da API da Tiny.', detalhes: retorno });
      }

      const produtos = retorno.produtos || [];
      produtos.forEach(p => {
        const marca = p.produto?.marca;
        if (marca) {
          marcasUnicas.add(marca.trim());
        }
      });

      const ultimaPagina = retorno.numero_paginas || 1;
      continuar = pagina < ultimaPagina;
      pagina++;

      // Limite de segurança durante testes
      if (pagina > 10) {
        console.warn('⚠️ Interrompido em 10 páginas por segurança.');
        break;
      }
    }

    const listaFinal = Array.from(marcasUnicas).sort();
    console.log(`✅ Marcas coletadas: ${listaFinal.length}`);
    res.json({
      marcas: listaFinal,
      total: listaFinal.length
    });

  } catch (error) {
    console.error('❌ Erro ao consultar marcas:', error.response?.data || error.message);
    res.status(500).send('Erro ao consultar marcas na API da Tiny.');
  }
});
