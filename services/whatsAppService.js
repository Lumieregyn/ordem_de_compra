const { enviarWhatsappErro } = require('./whatsAppService');
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

async function avaliarComIA(dados) {
  const prompt = `Você é um analista da API Tiny. Abaixo estão os dados da tentativa de criação de uma ordem de compra. Retorne apenas "true" se a OC foi criada com sucesso, mesmo que haja erro de conta contábil. Caso contrário, retorne "false". Nenhuma outra palavra.\n\nDados:\n${JSON.stringify(dados, null, 2)}\n\nResultado:`;

  try {
    const resposta = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo-0125',
      messages: [
        { role: 'system', content: 'Você decide se uma OC foi criada com sucesso com base em dados da API.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0
    });

    const saida = resposta.data.choices[0].message.content.trim().toLowerCase();
    return saida.includes('true');
  } catch (erro) {
    console.warn('⚠️ Falha na análise IA. Retornando false por padrão.', erro.message);
    return false;
  }
}

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
  const detalhesRaw = data?.retorno?.erros || data?.retorno?.detalhes;
  let detalhes = [];

  if (Array.isArray(detalhesRaw)) {
    detalhes = detalhesRaw;
  } else if (typeof detalhesRaw === 'object' && detalhesRaw !== null) {
    detalhes = [detalhesRaw];
  }

  const idOrdem = data?.retorno?.ordem_compra?.id;
  const status = data?.retorno?.status;
  const mensagem = data?.retorno?.mensagem;

  const sucesso = await avaliarComIA({ idOrdem, status, mensagem, detalhes });

  if (sucesso) {
    console.log(`✅ OC considerada como criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);

    const texto = `✅ Ordem de Compra criada com sucesso\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nFornecedor: ${fornecedor?.nome || '[desconhecido]'}`;

    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }

    return true;
  }

  // Se data.retorno não existe
  if (!data || !data.retorno) {
    console.error('❌ Resposta inválida da API Tiny: estrutura ausente');
    await enviarWhatsappErro(`🚨 Erro na resposta da API Tiny\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: Estrutura ausente`);
    return false;
  }

  // ❌ Erro real
  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: ${mensagem || 'Sem mensagem'}\nDetalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);

  return false;
}

module.exports = { validarRespostaOrdem };
