const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('views'));

// ============================================
// DADOS EM MEMÓRIA (NÃO USA BANCO DE DADOS)
// ============================================
let numeros = [];
let vendas = [];
let sorteios = [];
let configuracoes = {
    nome_rifa: 'MEGA RIFA PREMIUM',
    descricao_rifa: '🏆 Prêmio: R$ 10.000,00 + Moto 0km',
    valor_rifa: '10.00',
    chave_pix: 'admin@rifa.com',
    admin_whatsapp: '55999999999',
    rifa_ativa: 'true',
    ultimo_ganhador: '',
    ultimo_ganhador_numero: '',
    imagem_rifa: '',
    cor_principal: '#667eea',
    cor_secundaria: '#764ba2',
    mensagem_boas_vindas: 'Obrigado por participar da nossa rifa!',
    instrucoes_pagamento: '1. Faça o PIX para a chave acima\n2. Envie o comprovante para o administrador\n3. Aguarde a confirmação',
    rodape_comprovante: 'Boa sorte! 🍀\nSorteio ao atingir 100 números vendidos',
    mensagem_whatsapp: 'Olá {nome}!\n\n✅ Seu pagamento da rifa foi CONFIRMADO!\nNúmero: {numero}\nComprovante: {comprovante}\n\nBoa sorte! 🍀',
    mensagem_ganhador: '🎉 PARABÉNS {nome}! 🎉\n\nVocê foi o GANHADOR da nossa rifa!\nNúmero sorteado: {numero}\n\nEntre em contato para receber seu prêmio! 🏆'
};

// Inicializar números
for (let i = 1; i <= 100; i++) {
    numeros.push({
        numero: i,
        status: 'disponivel',
        comprador_nome: null,
        comprador_telefone: null,
        comprador_email: null,
        comprovante_codigo: null,
        data_reserva: null,
        data_confirmacao: null
    });
}

// ============================================
// ROTAS PÚBLICAS
// ============================================

app.get('/api/numeros', (req, res) => {
    res.json({
        rifa_ativa: configuracoes.rifa_ativa === 'true',
        numeros: numeros.map(n => ({ numero: n.numero, status: n.status }))
    });
});

app.get('/api/configuracoes', (req, res) => {
    const configPublica = {
        nome_rifa: configuracoes.nome_rifa,
        descricao_rifa: configuracoes.descricao_rifa,
        valor_rifa: configuracoes.valor_rifa,
        chave_pix: configuracoes.chave_pix,
        admin_whatsapp: configuracoes.admin_whatsapp,
        rifa_ativa: configuracoes.rifa_ativa,
        ultimo_ganhador: configuracoes.ultimo_ganhador,
        ultimo_ganhador_numero: configuracoes.ultimo_ganhador_numero,
        imagem_rifa: configuracoes.imagem_rifa,
        cor_principal: configuracoes.cor_principal,
        cor_secundaria: configuracoes.cor_secundaria,
        mensagem_boas_vindas: configuracoes.mensagem_boas_vindas,
        instrucoes_pagamento: configuracoes.instrucoes_pagamento,
        rodape_comprovante: configuracoes.rodape_comprovante
    };
    res.json(configPublica);
});

app.get('/api/ultimo-sorteio', (req, res) => {
    const ultimo = sorteios[sorteios.length - 1];
    res.json(ultimo || null);
});

app.post('/api/reservar', async (req, res) => {
    const { numero, nome, telefone, email } = req.body;

    if (configuracoes.rifa_ativa === 'false') {
        return res.status(400).json({ error: 'Esta rifa já foi finalizada! Aguarde a próxima rifa.' });
    }

    if (!numero || !nome || !telefone || !email) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const numeroObj = numeros.find(n => n.numero === numero);
    
    if (!numeroObj || numeroObj.status !== 'disponivel') {
        return res.status(400).json({ error: 'Número já reservado ou vendido' });
    }

    const comprovanteId = uuidv4();
    const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
    const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo);
    const valorRifa = parseFloat(configuracoes.valor_rifa);

    // Atualizar número
    numeroObj.status = 'reservado';
    numeroObj.comprador_nome = nome;
    numeroObj.comprador_telefone = telefone;
    numeroObj.comprador_email = email;
    numeroObj.comprovante_codigo = comprovanteCodigo;
    numeroObj.data_reserva = new Date().toISOString();

    // Registrar venda
    vendas.push({
        id: comprovanteId,
        numero: numero,
        nome: nome,
        telefone: telefone,
        email: email,
        comprovante_codigo: comprovanteCodigo,
        qr_code: qrCodeDataUrl,
        status_pagamento: 'pendente',
        valor_pago: valorRifa,
        data_pedido: new Date().toISOString(),
        data_pagamento: null
    });

    res.json({
        success: true,
        comprovante: comprovanteCodigo,
        qrCode: qrCodeDataUrl,
        numero: numero,
        valor: valorRifa,
        chave_pix: configuracoes.chave_pix,
        data: new Date().toISOString(),
        nome_rifa: configuracoes.nome_rifa,
        mensagem_boas_vindas: configuracoes.mensagem_boas_vindas,
        instrucoes_pagamento: configuracoes.instrucoes_pagamento,
        rodape_comprovante: configuracoes.rodape_comprovante
    });
});

// ============================================
// ROTAS ADMIN
// ============================================

app.get('/api/admin/dashboard', (req, res) => {
    const disponiveis = numeros.filter(n => n.status === 'disponivel').length;
    const reservados = numeros.filter(n => n.status === 'reservado').length;
    const pagos = numeros.filter(n => n.status === 'pago').length;
    const pendentes = vendas.filter(v => v.status_pagamento === 'pendente').length;
    const confirmados = vendas.filter(v => v.status_pagamento === 'confirmado').length;
    const total_arrecadado = vendas.filter(v => v.status_pagamento === 'confirmado').reduce((sum, v) => sum + v.valor_pago, 0);

    res.json({
        disponiveis, reservados, pagos, pendentes, confirmados, total_arrecadado,
        rifa_ativa: configuracoes.rifa_ativa
    });
});

app.get('/api/admin/vendas', (req, res) => {
    const pendentes = vendas.filter(v => v.status_pagamento === 'pendente');
    res.json(pendentes);
});

app.get('/api/admin/numeros', (req, res) => {
    res.json(numeros);
});

app.post('/api/admin/confirmar-pagamento', (req, res) => {
    const { venda_id, numero } = req.body;
    
    const venda = vendas.find(v => v.id === venda_id);
    if (venda) {
        venda.status_pagamento = 'confirmado';
        venda.data_pagamento = new Date().toISOString();
    }
    
    const numeroObj = numeros.find(n => n.numero === numero);
    if (numeroObj) {
        numeroObj.status = 'pago';
        numeroObj.data_confirmacao = new Date().toISOString();
    }
    
    res.json({ success: true });
});

app.post('/api/admin/cancelar-venda', (req, res) => {
    const { venda_id, numero } = req.body;
    
    const venda = vendas.find(v => v.id === venda_id);
    if (venda) {
        venda.status_pagamento = 'cancelado';
    }
    
    const numeroObj = numeros.find(n => n.numero === numero);
    if (numeroObj) {
        numeroObj.status = 'disponivel';
        numeroObj.comprador_nome = null;
        numeroObj.comprador_telefone = null;
        numeroObj.comprador_email = null;
        numeroObj.comprovante_codigo = null;
        numeroObj.data_reserva = null;
    }
    
    res.json({ success: true });
});

app.get('/api/admin/exportar', (req, res) => {
    const confirmadas = vendas.filter(v => v.status_pagamento === 'confirmado');
    res.json(confirmadas);
});

app.post('/api/admin/sortear', (req, res) => {
    const pagos = numeros.filter(n => n.status === 'pago');
    
    if (pagos.length === 0) {
        return res.status(400).json({ error: 'Não há números pagos para sortear!' });
    }
    
    const sorteado = pagos[Math.floor(Math.random() * pagos.length)];
    
    sorteios.push({
        numero: sorteado.numero,
        ganhador_nome: sorteado.comprador_nome,
        ganhador_telefone: sorteado.comprador_telefone,
        ganhador_email: sorteado.comprador_email,
        data_sorteio: new Date().toISOString()
    });
    
    configuracoes.rifa_ativa = 'false';
    configuracoes.ultimo_ganhador = sorteado.comprador_nome;
    configuracoes.ultimo_ganhador_numero = sorteado.numero;
    
    res.json({
        success: true,
        numero: sorteado.numero,
        nome: sorteado.comprador_nome,
        telefone: sorteado.comprador_telefone,
        email: sorteado.comprador_email,
        data_compra: sorteado.data_confirmacao
    });
});

app.get('/api/admin/historico-sorteios', (req, res) => {
    res.json(sorteios);
});

app.get('/api/admin/configuracoes', (req, res) => {
    res.json(configuracoes);
});

app.post('/api/admin/configuracoes', (req, res) => {
    const novasConfig = req.body;
    Object.assign(configuracoes, novasConfig);
    res.json({ success: true });
});

// ============================================
// SERVIDOR ESTÁTICO
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 SISTEMA DE RIFA - SERVIDOR RODANDO');
    console.log('='.repeat(50));
    console.log(`📱 Site do Cliente: http://localhost:${PORT}`);
    console.log(`👨‍💼 Painel Admin: http://localhost:${PORT}/admin`);
    console.log(`💾 Modo: Em memória (sem banco de dados)`);
    console.log('='.repeat(50));
});
