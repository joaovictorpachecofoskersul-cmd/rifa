const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'views')));

// ============================================
// ARQUIVOS DE DADOS (JSON)
// ============================================
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const NUMEROS_FILE = path.join(DATA_DIR, 'numeros.json');
const VENDAS_FILE = path.join(DATA_DIR, 'vendas.json');
const SORTEIOS_FILE = path.join(DATA_DIR, 'sorteios.json');

const ADMIN_PASSWORD = 'admin123';

// Garantir que a pasta data existe
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
    console.log('📁 Pasta data criada');
}

// ============================================
// FUNÇÕES DE LEITURA/ESCRITA
// ============================================

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {}
    
    return {
        id: 1,
        nome_rifa: 'MEGA RIFA PREMIUM',
        descricao_rifa: '🏆 Prêmio: R$ 10.000,00 + Moto 0km',
        valor_rifa: 10.00,
        chave_pix: 'admin@rifa.com',
        admin_whatsapp: '55999999999',
        rifa_ativa: 'true',
        ultimo_ganhador: '',
        ultimo_ganhador_numero: '',
        imagem_rifa: '',
        cor_principal: '#667eea',
        cor_secundaria: '#764ba2',
        mensagem_boas_vindas: 'Obrigado por participar da nossa rifa!',
        instrucoes_pagamento: '1. Faça o PIX para a chave acima\n2. Envie o comprovante\n3. Aguarde a confirmação',
        rodape_comprovante: 'Boa sorte! 🍀\nSorteio ao atingir 100 números',
        mensagem_whatsapp: 'Olá {nome}!\n✅ Pagamento CONFIRMADO!\nNúmero: {numero}\nBoa sorte! 🍀',
        mensagem_ganhador: '🎉 PARABÉNS {nome}!\nNúmero: {numero}\nEntre em contato! 🏆'
    };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadNumeros() {
    try {
        if (fs.existsSync(NUMEROS_FILE)) {
            return JSON.parse(fs.readFileSync(NUMEROS_FILE, 'utf8'));
        }
    } catch (e) {}
    
    const numeros = [];
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
    saveNumeros(numeros);
    return numeros;
}

function saveNumeros(numeros) {
    fs.writeFileSync(NUMEROS_FILE, JSON.stringify(numeros, null, 2));
}

function loadVendas() {
    try {
        if (fs.existsSync(VENDAS_FILE)) {
            return JSON.parse(fs.readFileSync(VENDAS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveVendas(vendas) {
    fs.writeFileSync(VENDAS_FILE, JSON.stringify(vendas, null, 2));
}

function loadSorteios() {
    try {
        if (fs.existsSync(SORTEIOS_FILE)) {
            return JSON.parse(fs.readFileSync(SORTEIOS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveSorteios(sorteios) {
    fs.writeFileSync(SORTEIOS_FILE, JSON.stringify(sorteios, null, 2));
}

// ============================================
// AUTENTICAÇÃO ADMIN
// ============================================
function authAdmin(req, res, next) {
    const token = req.headers['admin-token'];
    if (token === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Acesso negado!' });
    }
}

// ============================================
// ROTAS PÚBLICAS
// ============================================

app.get('/api/numeros', (req, res) => {
    try {
        const config = loadConfig();
        const numeros = loadNumeros();
        
        console.log(`📊 Enviando ${numeros.length} números`);
        
        res.json({
            rifa_ativa: config.rifa_ativa === 'true',
            numeros: numeros.map(n => ({ 
                numero: n.numero, 
                status: n.status 
            }))
        });
    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/configuracoes', (req, res) => {
    try {
        const config = loadConfig();
        const configPublica = {
            nome_rifa: config.nome_rifa,
            descricao_rifa: config.descricao_rifa,
            valor_rifa: config.valor_rifa,
            chave_pix: config.chave_pix,
            admin_whatsapp: config.admin_whatsapp,
            rifa_ativa: config.rifa_ativa,
            ultimo_ganhador: config.ultimo_ganhador,
            ultimo_ganhador_numero: config.ultimo_ganhador_numero,
            imagem_rifa: config.imagem_rifa,
            cor_principal: config.cor_principal,
            cor_secundaria: config.cor_secundaria,
            mensagem_boas_vindas: config.mensagem_boas_vindas,
            instrucoes_pagamento: config.instrucoes_pagamento,
            rodape_comprovante: config.rodape_comprovante
        };
        res.json(configPublica);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ultimo-sorteio', (req, res) => {
    try {
        const sorteios = loadSorteios();
        res.json(sorteios[sorteios.length - 1] || null);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reservar', async (req, res) => {
    try {
        const { numero, nome, telefone, email } = req.body;
        const config = loadConfig();

        if (config.rifa_ativa === 'false') {
            return res.status(400).json({ error: 'Rifa finalizada!' });
        }

        let numeros = loadNumeros();
        const numeroObj = numeros.find(n => n.numero === numero);
        
        if (!numeroObj || numeroObj.status !== 'disponivel') {
            return res.status(400).json({ error: 'Número indisponível' });
        }

        const comprovanteId = uuidv4();
        const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
        const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo);
        const valorRifa = parseFloat(config.valor_rifa);

        numeroObj.status = 'reservado';
        numeroObj.comprador_nome = nome;
        numeroObj.comprador_telefone = telefone;
        numeroObj.comprador_email = email;
        numeroObj.comprovante_codigo = comprovanteCodigo;
        numeroObj.data_reserva = new Date().toISOString();
        saveNumeros(numeros);

        const vendas = loadVendas();
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
        saveVendas(vendas);

        res.json({
            success: true,
            comprovante: comprovanteCodigo,
            qrCode: qrCodeDataUrl,
            numero: numero,
            valor: valorRifa,
            chave_pix: config.chave_pix,
            data: new Date().toISOString(),
            nome_rifa: config.nome_rifa,
            mensagem_boas_vindas: config.mensagem_boas_vindas,
            instrucoes_pagamento: config.instrucoes_pagamento,
            rodape_comprovante: config.rodape_comprovante
        });
    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTA PARA RESERVAR MÚLTIPLOS NÚMEROS
// ============================================
app.post('/api/reservar-multiplos', async (req, res) => {
    try {
        const { numeros, nome, telefone, email } = req.body;
        const config = loadConfig();

        if (config.rifa_ativa === 'false') {
            return res.status(400).json({ error: 'Rifa finalizada!' });
        }

        if (!numeros || numeros.length === 0) {
            return res.status(400).json({ error: 'Nenhum número selecionado!' });
        }

        let numerosDisponiveis = loadNumeros();
        const resultados = [];
        const valorRifa = parseFloat(config.valor_rifa);
        const valorTotal = valorRifa * numeros.length;

        for (const numero of numeros) {
            const numeroObj = numerosDisponiveis.find(n => n.numero === numero);
            if (!numeroObj || numeroObj.status !== 'disponivel') {
                return res.status(400).json({ 
                    error: `Número ${numero} não está mais disponível!`,
                    numero_indisponivel: numero
                });
            }
        }

        for (const numero of numeros) {
            const comprovanteId = uuidv4();
            const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
            const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo);

            const numeroObj = numerosDisponiveis.find(n => n.numero === numero);
            numeroObj.status = 'reservado';
            numeroObj.comprador_nome = nome;
            numeroObj.comprador_telefone = telefone;
            numeroObj.comprador_email = email;
            numeroObj.comprovante_codigo = comprovanteCodigo;
            numeroObj.data_reserva = new Date().toISOString();
            
            const vendas = loadVendas();
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
            saveVendas(vendas);
            
            resultados.push({
                numero: numero,
                comprovante: comprovanteCodigo,
                qrCode: qrCodeDataUrl
            });
        }
        
        saveNumeros(numerosDisponiveis);

        res.json({
            success: true,
            numeros: resultados,
            total_numeros: numeros.length,
            valor_total: valorTotal,
            valor_unitario: valorRifa,
            chave_pix: config.chave_pix,
            nome_rifa: config.nome_rifa,
            mensagem_boas_vindas: config.mensagem_boas_vindas,
            instrucoes_pagamento: config.instrucoes_pagamento,
            rodape_comprovante: config.rodape_comprovante,
            data: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTAS ADMIN
// ============================================

app.get('/api/admin/dashboard', authAdmin, (req, res) => {
    try {
        const numeros = loadNumeros();
        const vendas = loadVendas();
        
        const disponiveis = numeros.filter(n => n.status === 'disponivel').length;
        const reservados = numeros.filter(n => n.status === 'reservado').length;
        const pagos = numeros.filter(n => n.status === 'pago').length;
        const pendentes = vendas.filter(v => v.status_pagamento === 'pendente').length;
        const confirmados = vendas.filter(v => v.status_pagamento === 'confirmado').length;
        const total_arrecadado = vendas.filter(v => v.status_pagamento === 'confirmado').reduce((sum, v) => sum + parseFloat(v.valor_pago), 0);

        res.json({ disponiveis, reservados, pagos, pendentes, confirmados, total_arrecadado });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/vendas', authAdmin, (req, res) => {
    try {
        const vendas = loadVendas();
        res.json(vendas.filter(v => v.status_pagamento === 'pendente'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/numeros', authAdmin, (req, res) => {
    try {
        const numeros = loadNumeros();
        res.json(numeros);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/confirmar-pagamento', authAdmin, (req, res) => {
    try {
        const { venda_id, numero } = req.body;
        
        let vendas = loadVendas();
        const vendaIndex = vendas.findIndex(v => v.id === venda_id);
        if (vendaIndex !== -1) {
            vendas[vendaIndex].status_pagamento = 'confirmado';
            vendas[vendaIndex].data_pagamento = new Date().toISOString();
            saveVendas(vendas);
        }
        
        let numeros = loadNumeros();
        const numeroObj = numeros.find(n => n.numero === numero);
        if (numeroObj) {
            numeroObj.status = 'pago';
            numeroObj.data_confirmacao = new Date().toISOString();
            saveNumeros(numeros);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/cancelar-venda', authAdmin, (req, res) => {
    try {
        const { venda_id, numero } = req.body;
        
        let vendas = loadVendas();
        const vendaIndex = vendas.findIndex(v => v.id === venda_id);
        if (vendaIndex !== -1) {
            vendas[vendaIndex].status_pagamento = 'cancelado';
            saveVendas(vendas);
        }
        
        let numeros = loadNumeros();
        const numeroObj = numeros.find(n => n.numero === numero);
        if (numeroObj) {
            numeroObj.status = 'disponivel';
            numeroObj.comprador_nome = null;
            numeroObj.comprador_telefone = null;
            numeroObj.comprador_email = null;
            numeroObj.comprovante_codigo = null;
            numeroObj.data_reserva = null;
            numeroObj.data_confirmacao = null;
            saveNumeros(numeros);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/exportar', authAdmin, (req, res) => {
    try {
        const vendas = loadVendas();
        res.json(vendas.filter(v => v.status_pagamento === 'confirmado'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/sortear', authAdmin, (req, res) => {
    try {
        const numeros = loadNumeros();
        const pagos = numeros.filter(n => n.status === 'pago');
        
        if (pagos.length === 0) {
            return res.status(400).json({ error: 'Não há números pagos!' });
        }
        
        const sorteado = pagos[Math.floor(Math.random() * pagos.length)];
        
        const sorteios = loadSorteios();
        sorteios.push({
            id: Date.now(),
            numero: sorteado.numero,
            ganhador_nome: sorteado.comprador_nome,
            ganhador_telefone: sorteado.comprador_telefone,
            ganhador_email: sorteado.comprador_email,
            data_sorteio: new Date().toISOString()
        });
        saveSorteios(sorteios);
        
        const config = loadConfig();
        config.rifa_ativa = 'false';
        config.ultimo_ganhador = sorteado.comprador_nome;
        config.ultimo_ganhador_numero = sorteado.numero;
        saveConfig(config);
        
        res.json({
            success: true,
            numero: sorteado.numero,
            nome: sorteado.comprador_nome,
            telefone: sorteado.comprador_telefone,
            email: sorteado.comprador_email,
            data_compra: sorteado.data_confirmacao
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/historico-sorteios', authAdmin, (req, res) => {
    try {
        const sorteios = loadSorteios();
        res.json(sorteios.reverse());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/configuracoes', authAdmin, (req, res) => {
    try {
        const config = loadConfig();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/configuracoes', authAdmin, (req, res) => {
    try {
        const novasConfig = req.body;
        const config = loadConfig();
        Object.assign(config, novasConfig);
        saveConfig(config);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTAS DE RESET
// ============================================

app.post('/api/admin/reset-rifa', authAdmin, (req, res) => {
    try {
        let numeros = loadNumeros();
        numeros = numeros.map(n => ({
            numero: n.numero,
            status: 'disponivel',
            comprador_nome: null,
            comprador_telefone: null,
            comprador_email: null,
            comprovante_codigo: null,
            data_reserva: null,
            data_confirmacao: null
        }));
        saveNumeros(numeros);
        
        saveVendas([]);
        
        const config = loadConfig();
        config.rifa_ativa = 'true';
        config.ultimo_ganhador = '';
        config.ultimo_ganhador_numero = '';
        saveConfig(config);
        
        res.json({ success: true, message: 'Rifa resetada com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/limpar-vendas', authAdmin, (req, res) => {
    try {
        saveVendas([]);
        
        let numeros = loadNumeros();
        numeros = numeros.map(n => ({
            numero: n.numero,
            status: 'disponivel',
            comprador_nome: null,
            comprador_telefone: null,
            comprador_email: null,
            comprovante_codigo: null,
            data_reserva: null,
            data_confirmacao: null
        }));
        saveNumeros(numeros);
        
        const config = loadConfig();
        config.rifa_ativa = 'true';
        saveConfig(config);
        
        res.json({ success: true, message: 'Vendas limpas com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTA DE HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        storage: 'JSON',
        numeros: loadNumeros().length,
        timestamp: new Date().toISOString()
    });
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

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 SISTEMA DE RIFA (JSON Storage)');
    console.log('='.repeat(50));
    console.log(`📱 Site: http://localhost:${PORT}`);
    console.log(`👨‍💼 Admin: http://localhost:${PORT}/admin`);
    console.log(`🔐 Senha Admin: ${ADMIN_PASSWORD}`);
    console.log(`💾 Armazenamento: Arquivos JSON`);
    console.log(`📊 Números: ${loadNumeros().length}`);
    console.log('='.repeat(50));
});
