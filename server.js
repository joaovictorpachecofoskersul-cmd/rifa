const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const dataManager = require('./dataManager');  // ← ADICIONE ESTA LINHA AQUI

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'views')));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'views')));

// ============================================
// CONEXÃO COM MySQL (COM SEU USUÁRIO)
// ============================================
const dbConfig = {
    host: '127.0.0.1',
    user: 'u519611382_rifa',           // SEU USUÁRIO
    password: '21@Joao21',                       // VOCÊ COLOCA A SENHA
    database: 'u519611382_rifa',       // SEU BANCO
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = null;

async function initMySQL() {
    try {
        pool = await mysql.createPool(dbConfig);
        console.log('✅ MySQL conectado com sucesso!');
        await criarTabelas();
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar MySQL:', error.message);
        console.log('⚠️ Sistema continuará usando apenas JSON');
        return false;
    }
}

// TESTE: Verificar se o MySQL está conectando (remova depois)
setTimeout(async () => {
    if (pool) {
        try {
            const [rows] = await pool.execute('SELECT COUNT(*) as total FROM usuarios');
            console.log('✅ MySQL conectado! Usuários no banco:', rows[0].total);
        } catch(e) {
            console.log('❌ Erro no MySQL:', e.message);
            console.log('⚠️ Verifique as credenciais do banco');
        }
    } else {
        console.log('❌ Pool MySQL não inicializado');
    }
}, 3000); 

async function criarTabelas() {
    if (!pool) return;
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id VARCHAR(36) PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                empresa VARCHAR(100),
                data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela usuarios OK');
        
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS rifas (
                id VARCHAR(36) PRIMARY KEY,
                usuario_id VARCHAR(36) NOT NULL,
                nome VARCHAR(100) NOT NULL,
                descricao TEXT,
                valor DECIMAL(10,2) NOT NULL,
                total_numeros INT DEFAULT 100,
                premio TEXT,
                status VARCHAR(20) DEFAULT 'ativa',
                data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
                ultimo_ganhador VARCHAR(100),
                ultimo_ganhador_numero INT,
                config TEXT
            )
        `);
        console.log('✅ Tabela rifas OK');
        
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS numeros (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rifa_id VARCHAR(36) NOT NULL,
                numero INT NOT NULL,
                status VARCHAR(20) DEFAULT 'disponivel',
                comprador_nome VARCHAR(100),
                comprador_telefone VARCHAR(20),
                comprador_email VARCHAR(100),
                comprovante_codigo VARCHAR(50),
                data_reserva DATETIME,
                data_confirmacao DATETIME
            )
        `);
        console.log('✅ Tabela numeros OK');
        
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS vendas (
                id VARCHAR(36) PRIMARY KEY,
                rifa_id VARCHAR(36) NOT NULL,
                numero INT NOT NULL,
                nome VARCHAR(100),
                telefone VARCHAR(20),
                email VARCHAR(100),
                comprovante_codigo VARCHAR(50),
                qr_code TEXT,
                status_pagamento VARCHAR(20) DEFAULT 'pendente',
                valor_pago DECIMAL(10,2),
                data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
                data_pagamento DATETIME
            )
        `);
        console.log('✅ Tabela vendas OK');
        
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS sorteios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rifa_id VARCHAR(36) NOT NULL,
                numero INT NOT NULL,
                ganhador_nome VARCHAR(100),
                ganhador_telefone VARCHAR(20),
                ganhador_email VARCHAR(100),
                data_sorteio DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela sorteios OK');
        
    } catch (error) {
        console.error('Erro ao criar tabelas:', error);
    }
}

// ============================================
// CONFIGURAÇÕES
// ============================================
const DATA_DIR = path.join(__dirname, 'data');
const USUARIOS_DIR = path.join(DATA_DIR, 'usuarios');
const RIFAS_DIR = path.join(DATA_DIR, 'rifas');

const ADMIN_PASSWORD = 'admin123';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USUARIOS_DIR)) fs.mkdirSync(USUARIOS_DIR);
if (!fs.existsSync(RIFAS_DIR)) fs.mkdirSync(RIFAS_DIR);

// ============================================
// FUNÇÕES DE USUÁRIOS (COM DATA MANAGER)
// ============================================

function carregarUsuarios() {
    return dataManager.loadUsers();
}

function salvarUsuarios(usuarios) {
    return dataManager.saveUsers(usuarios);
}


async function salvarUsuarioMySQL(usuario) {
    if (!pool) {
        console.log('⚠️ MySQL não conectado, usuário salvo apenas no JSON');
        return;
    }
    try {
        const [result] = await pool.execute(
            'INSERT INTO usuarios (id, nome, email, senha, empresa, data_criacao) VALUES (?, ?, ?, ?, ?, ?)',
            [usuario.id, usuario.nome, usuario.email, usuario.senha, usuario.empresa, usuario.data_criacao]
        );
        console.log('✅ Usuario salvo no MySQL:', usuario.email, 'Resultado:', result);
    } catch (error) {
        console.error('❌ Erro detalhado ao salvar no MySQL:', error.message);
        console.log('⚠️ Usuário salvo apenas no JSON');
    }
}

function criarUsuario(nome, email, senha, empresa) {
    const usuarios = carregarUsuarios();
    
    if (usuarios.find(u => u.email === email)) {
        return { error: 'Email já cadastrado!' };
    }
    
    const usuarioId = uuidv4();
    const hashedPassword = bcrypt.hashSync(senha, 10);
    
    const configPadrao = {
        nome_rifa: 'MEGA RIFA PREMIUM',
        descricao_rifa: '🏆 Prêmio: R$ 10.000,00 + Moto 0km',
        valor_rifa: 10.00,
        chave_pix: '',
        admin_whatsapp: '',
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
    
    const novoUsuario = {
        id: usuarioId,
        nome: nome,
        email: email,
        senha: hashedPassword,
        empresa: empresa || nome,
        data_criacao: new Date().toISOString(),
        config: configPadrao,
        rifas: []
    };
    
    usuarios.push(novoUsuario);
    salvarUsuarios(usuarios);
    
    salvarUsuarioMySQL(novoUsuario);
    
    const userDir = path.join(RIFAS_DIR, usuarioId);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir);
    
    return { success: true, usuarioId: usuarioId };
}

function autenticarUsuario(email, senha) {
    const usuarios = carregarUsuarios();
    const usuario = usuarios.find(u => u.email === email);
    if (!usuario) return null;
    if (!bcrypt.compareSync(senha, usuario.senha)) return null;
    return usuario;
}

function getUsuarioById(usuarioId) {
    const usuarios = carregarUsuarios();
    return usuarios.find(u => u.id === usuarioId);
}

// ============================================
// FUNÇÕES DE RIFAS (COM DATA MANAGER)
// ============================================

function carregarRifas(usuarioId) {
    return dataManager.loadAllRifas(usuarioId);
}

function carregarRifa(usuarioId, rifaId) {
    return dataManager.loadRifa(usuarioId, rifaId);
}

function salvarRifa(usuarioId, rifaId, data) {
    return dataManager.saveRifa(usuarioId, rifaId, data);
}

function criarNovaRifa(usuarioId, nomeRifa, descricao, valor, qtdNumeros, premio) {
    const rifaId = uuidv4();
    const totalNumeros = Math.min(Math.max(parseInt(qtdNumeros) || 100, 10), 500);
    
    const numeros = [];
    for (let i = 1; i <= totalNumeros; i++) {
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
    
    const novaRifa = {
        id: rifaId,
        nome: nomeRifa,
        descricao: descricao,
        valor: parseFloat(valor),
        total_numeros: totalNumeros,
        premio: premio,
        status: 'ativa',
        data_criacao: new Date().toISOString(),
        ultimo_ganhador: null,
        ultimo_ganhador_numero: null,
        numeros: numeros,
        vendas: [],
        sorteios: [],
        config: {
            nome_rifa: nomeRifa,
            descricao_rifa: descricao,
            valor_rifa: parseFloat(valor),
            chave_pix: '',
            admin_whatsapp: '',
            imagem_rifa: '',
            cor_principal: '#667eea',
            cor_secundaria: '#764ba2',
            mensagem_boas_vindas: 'Obrigado por participar da nossa rifa!',
            instrucoes_pagamento: '1. Faça o PIX para a chave acima\n2. Envie o comprovante\n3. Aguarde a confirmação',
            rodape_comprovante: 'Boa sorte! 🍀',
            mensagem_whatsapp: 'Olá {nome}!\n✅ Pagamento CONFIRMADO!\nNúmero: {numero}\nBoa sorte! 🍀',
            mensagem_ganhador: '🎉 PARABÉNS {nome}!\nNúmero: {numero}\nEntre em contato! 🏆'
        }
    };
    
    salvarRifa(usuarioId, rifaId, novaRifa);
    
    const usuarios = carregarUsuarios();
    const usuarioIndex = usuarios.findIndex(u => u.id === usuarioId);
    if (usuarioIndex !== -1) {
        usuarios[usuarioIndex].rifas.push({
            id: rifaId,
            nome: nomeRifa,
            data_criacao: new Date().toISOString(),
            status: 'ativa'
        });
        salvarUsuarios(usuarios);
    }
    
    return novaRifa;
}

// ============================================
// FUNÇÃO PARA GERAR QR CODE DO PIX
// ============================================
async function gerarQRCodePix(chavePix, nomeRecebedor, cidade) {
    try {
        const chaveLimpa = chavePix.replace(/\s+/g, '').replace(/[-\.]/g, '');
        const nomeLimpo = nomeRecebedor.substring(0, 25).toUpperCase();
        const cidadeLimpa = cidade.substring(0, 15).toUpperCase();
        
        let payload = '';
        payload += '000201';
        let gui = '0014BR.GOV.BCB.PIX';
        let chavePayload = `01${String(chaveLimpa.length).padStart(2, '0')}${chaveLimpa}`;
        let mpi = gui + chavePayload;
        payload += `26${String(mpi.length).padStart(2, '0')}${mpi}`;
        payload += '52040000';
        payload += '5303986';
        payload += '5802BR';
        payload += `59${String(nomeLimpo.length).padStart(2, '0')}${nomeLimpo}`;
        payload += `60${String(cidadeLimpa.length).padStart(2, '0')}${cidadeLimpa}`;
        let txid = `RIFA${Date.now()}`.substring(0, 25);
        let additionalData = `05${String(txid.length).padStart(2, '0')}${txid}`;
        payload += `62${String(additionalData.length).padStart(2, '0')}${additionalData}`;
        
        const crc16 = (str) => {
            let crc = 0xFFFF;
            for (let i = 0; i < str.length; i++) {
                crc ^= str.charCodeAt(i) << 8;
                for (let j = 0; j < 8; j++) {
                    crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
                }
            }
            return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
        };
        
        const crc = crc16(payload + '6304');
        const payloadCompleto = payload + '6304' + crc;
        
        return await QRCode.toDataURL(payloadCompleto, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300
        });
        
    } catch (error) {
        console.error('Erro ao gerar QR Code PIX:', error);
        return null;
    }
}

// ============================================
// MIDDLEWARES
// ============================================

function authUsuario(req, res, next) {
    const token = req.headers['user-token'];
    if (!token) {
        return res.status(401).json({ error: 'Usuário não autenticado!' });
    }
    const usuario = getUsuarioById(token);
    if (!usuario) {
        return res.status(401).json({ error: 'Usuário inválido!' });
    }
    req.usuario = usuario;
    next();
}

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

app.post('/api/cadastrar', (req, res) => {
    const { nome, email, senha, empresa } = req.body;
    if (!nome || !email || !senha) {
        return res.status(400).json({ error: 'Preencha todos os campos!' });
    }
    const result = criarUsuario(nome, email, senha, empresa || '');
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    const usuario = autenticarUsuario(email, senha);
    if (!usuario) {
        return res.status(401).json({ error: 'Email ou senha inválidos!' });
    }
    res.json({
        success: true,
        usuario: {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            empresa: usuario.empresa
        }
    });
});

// ============================================
// ROTAS PÚBLICAS PARA COMPRADORES
// ============================================

app.get('/api/public/rifa/:usuarioId/:rifaId', (req, res) => {
    const rifa = carregarRifa(req.params.usuarioId, req.params.rifaId);
    if (!rifa) {
        return res.status(404).json({ error: 'Rifa não encontrada!' });
    }
    res.json({
        id: rifa.id,
        nome: rifa.nome,
        descricao: rifa.descricao,
        valor: rifa.valor,
        premio: rifa.premio,
        status: rifa.status,
        ultimo_ganhador: rifa.ultimo_ganhador,
        ultimo_ganhador_numero: rifa.ultimo_ganhador_numero,
        numeros: rifa.numeros.map(n => ({ numero: n.numero, status: n.status })),
        nome_rifa: rifa.config?.nome_rifa || rifa.nome,
        descricao_rifa: rifa.config?.descricao_rifa || rifa.descricao,
        valor_rifa: rifa.config?.valor_rifa || rifa.valor,
        chave_pix: rifa.config?.chave_pix || '',
        admin_whatsapp: rifa.config?.admin_whatsapp || '',
        rifa_ativa: rifa.status === 'ativa' ? 'true' : 'false',
        imagem_rifa: rifa.config?.imagem_rifa || '',
        cor_principal: rifa.config?.cor_principal || '#667eea',
        cor_secundaria: rifa.config?.cor_secundaria || '#764ba2',
        mensagem_boas_vindas: rifa.config?.mensagem_boas_vindas || '',
        instrucoes_pagamento: rifa.config?.instrucoes_pagamento || '',
        rodape_comprovante: rifa.config?.rodape_comprovante || ''
    });
});

app.post('/api/public/rifa/:usuarioId/:rifaId/reservar', async (req, res) => {
    try {
        const { numeros, nome, telefone, email } = req.body;
        const rifa = carregarRifa(req.params.usuarioId, req.params.rifaId);
        
        if (!rifa) {
            return res.status(404).json({ error: 'Rifa não encontrada!' });
        }
        
        if (rifa.status !== 'ativa') {
            return res.status(400).json({ error: 'Rifa finalizada!' });
        }
        
        if (!numeros || numeros.length === 0) {
            return res.status(400).json({ error: 'Nenhum número selecionado!' });
        }
        
        for (const numero of numeros) {
            const numeroObj = rifa.numeros.find(n => n.numero === numero);
            if (!numeroObj || numeroObj.status !== 'disponivel') {
                return res.status(400).json({ 
                    error: `Número ${numero} não está mais disponível!`,
                    numero_indisponivel: numero
                });
            }
        }
        
        const comprovanteId = uuidv4();
        const valorTotal = rifa.valor * numeros.length;
        const resultados = [];
        const codigos = [];
        
        for (const numero of numeros) {
            const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
            codigos.push(comprovanteCodigo);
            
            const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo, {
                errorCorrectionLevel: 'L',
                margin: 1,
                width: 200,
                color: { dark: '#000000', light: '#ffffff' }
            });
            
            const numeroObj = rifa.numeros.find(n => n.numero === numero);
            numeroObj.status = 'reservado';
            numeroObj.comprador_nome = nome;
            numeroObj.comprador_telefone = telefone;
            numeroObj.comprador_email = email;
            numeroObj.comprovante_codigo = comprovanteCodigo;
            numeroObj.data_reserva = new Date().toISOString();
            
            rifa.vendas.push({
                id: uuidv4(),
                numero: numero,
                nome: nome,
                telefone: telefone,
                email: email,
                comprovante_codigo: comprovanteCodigo,
                qr_code: qrCodeDataUrl,
                status_pagamento: 'pendente',
                valor_pago: rifa.valor,
                data_pedido: new Date().toISOString()
            });
            
            resultados.push({
                numero: numero,
                comprovante: comprovanteCodigo,
                qrCode: qrCodeDataUrl
            });
        }
        
        salvarRifa(req.params.usuarioId, rifa.id, rifa);
        
        let pixQRCode = '';
        const chavePix = rifa.config?.chave_pix || '';
        if (chavePix && chavePix !== '') {
            try {
                const nomeOrganizador = req.usuario?.nome || rifa.config?.nome_organizador || 'Organizador';
                const cidade = rifa.config?.cidade || 'Cidade';
                pixQRCode = await gerarQRCodePix(chavePix, nomeOrganizador, cidade);
            } catch(err) {
                console.error('Erro ao gerar QR Code PIX:', err);
                pixQRCode = '';
            }
        }
        
        res.json({
            success: true,
            numeros: resultados,
            total_numeros: numeros.length,
            valor_total: valorTotal,
            valor_unitario: rifa.valor,
            chave_pix: rifa.config?.chave_pix || '',
            pix_qr_code: pixQRCode,
            nome_rifa: rifa.config?.nome_rifa || rifa.nome,
            mensagem_boas_vindas: rifa.config?.mensagem_boas_vindas || '',
            instrucoes_pagamento: rifa.config?.instrucoes_pagamento || '',
            rodape_comprovante: rifa.config?.rodape_comprovante || '',
            codigo_unico: codigos[0],
            data: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTAS DO USUÁRIO (DASHBOARD)
// ============================================

app.get('/api/user/rifas', authUsuario, (req, res) => {
    const rifas = carregarRifas(req.usuario.id);
    res.json(rifas);
});

app.post('/api/user/rifas/nova', authUsuario, (req, res) => {
    const { nome, descricao, valor, qtdNumeros, premio } = req.body;
    if (!nome || !valor) {
        return res.status(400).json({ error: 'Nome e valor são obrigatórios!' });
    }
    const quantidade = parseInt(qtdNumeros) || 100;
    const novaRifa = criarNovaRifa(req.usuario.id, nome, descricao, valor, quantidade, premio || '');
    res.json({ success: true, rifa: novaRifa });
});

app.get('/api/user/dashboard/:rifaId', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    const disponiveis = rifa.numeros.filter(n => n.status === 'disponivel').length;
    const reservados = rifa.numeros.filter(n => n.status === 'reservado').length;
    const pagos = rifa.numeros.filter(n => n.status === 'pago').length;
    const pendentes = rifa.vendas.filter(v => v.status_pagamento === 'pendente').length;
    const total_arrecadado = rifa.vendas.filter(v => v.status_pagamento === 'confirmado').reduce((sum, v) => sum + v.valor_pago, 0);
    res.json({ disponiveis, reservados, pagos, pendentes, total_arrecadado });
});

app.get('/api/user/vendas/:rifaId', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    res.json(rifa.vendas.filter(v => v.status_pagamento === 'pendente'));
});

app.get('/api/user/numeros/:rifaId', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    res.json(rifa.numeros);
});

app.post('/api/user/confirmar-pagamento/:rifaId', authUsuario, (req, res) => {
    const { venda_id, numero } = req.body;
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    const vendaIndex = rifa.vendas.findIndex(v => v.id === venda_id);
    if (vendaIndex !== -1) {
        rifa.vendas[vendaIndex].status_pagamento = 'confirmado';
        rifa.vendas[vendaIndex].data_pagamento = new Date().toISOString();
        const numeroObj = rifa.numeros.find(n => n.numero === numero);
        if (numeroObj) {
            numeroObj.status = 'pago';
            numeroObj.data_confirmacao = new Date().toISOString();
        }
        salvarRifa(req.usuario.id, req.params.rifaId, rifa);
    }
    res.json({ success: true });
});

app.post('/api/user/cancelar-venda/:rifaId', authUsuario, (req, res) => {
    const { venda_id, numero } = req.body;
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    const vendaIndex = rifa.vendas.findIndex(v => v.id === venda_id);
    if (vendaIndex !== -1) {
        rifa.vendas[vendaIndex].status_pagamento = 'cancelado';
        const numeroObj = rifa.numeros.find(n => n.numero === numero);
        if (numeroObj) {
            numeroObj.status = 'disponivel';
            numeroObj.comprador_nome = null;
            numeroObj.comprador_telefone = null;
            numeroObj.comprador_email = null;
            numeroObj.comprovante_codigo = null;
            numeroObj.data_reserva = null;
        }
        salvarRifa(req.usuario.id, req.params.rifaId, rifa);
    }
    res.json({ success: true });
});

app.post('/api/user/sortear/:rifaId', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    const pagos = rifa.numeros.filter(n => n.status === 'pago');
    if (pagos.length === 0) {
        return res.status(400).json({ error: 'Não há números pagos!' });
    }
    const sorteado = pagos[Math.floor(Math.random() * pagos.length)];
    rifa.sorteios.push({
        id: Date.now(),
        numero: sorteado.numero,
        ganhador_nome: sorteado.comprador_nome,
        ganhador_telefone: sorteado.comprador_telefone,
        ganhador_email: sorteado.comprador_email,
        data_sorteio: new Date().toISOString()
    });
    rifa.status = 'finalizada';
    rifa.ultimo_ganhador = sorteado.comprador_nome;
    rifa.ultimo_ganhador_numero = sorteado.numero;
    salvarRifa(req.usuario.id, req.params.rifaId, rifa);
    res.json({
        success: true,
        numero: sorteado.numero,
        nome: sorteado.comprador_nome,
        telefone: sorteado.comprador_telefone,
        email: sorteado.comprador_email
    });
});

app.post('/api/user/reset-rifa/:rifaId', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    for (let i = 1; i <= rifa.numeros.length; i++) {
        const numeroObj = rifa.numeros.find(n => n.numero === i);
        if (numeroObj) {
            numeroObj.status = 'disponivel';
            numeroObj.comprador_nome = null;
            numeroObj.comprador_telefone = null;
            numeroObj.comprador_email = null;
            numeroObj.comprovante_codigo = null;
            numeroObj.data_reserva = null;
            numeroObj.data_confirmacao = null;
        }
    }
    rifa.vendas = [];
    rifa.status = 'ativa';
    rifa.ultimo_ganhador = null;
    rifa.ultimo_ganhador_numero = null;
    salvarRifa(req.usuario.id, req.params.rifaId, rifa);
    res.json({ success: true });
});

app.get('/api/user/historico/:rifaId', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    res.json(rifa.sorteios.reverse());
});

app.get('/api/user/rifa/:rifaId/configuracoes', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    const config = rifa.config || {
        nome_rifa: rifa.nome,
        descricao_rifa: rifa.descricao,
        valor_rifa: rifa.valor,
        chave_pix: '',
        admin_whatsapp: '',
        imagem_rifa: '',
        cor_principal: '#667eea',
        cor_secundaria: '#764ba2',
        mensagem_boas_vindas: 'Obrigado por participar da nossa rifa!',
        instrucoes_pagamento: '1. Faça o PIX para a chave acima\n2. Envie o comprovante\n3. Aguarde a confirmação',
        rodape_comprovante: 'Boa sorte! 🍀',
        mensagem_whatsapp: 'Olá {nome}!\n✅ Pagamento CONFIRMADO!\nNúmero: {numero}\nBoa sorte! 🍀',
        mensagem_ganhador: '🎉 PARABÉNS {nome}!\nNúmero: {numero}\nEntre em contato! 🏆'
    };
    res.json(config);
});

app.post('/api/user/rifa/:rifaId/configuracoes', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    const novasConfig = req.body;
    if (!rifa.config) rifa.config = {};
    Object.assign(rifa.config, novasConfig);
    if (novasConfig.nome_rifa) rifa.nome = novasConfig.nome_rifa;
    if (novasConfig.descricao_rifa) rifa.descricao = novasConfig.descricao_rifa;
    if (novasConfig.valor_rifa) rifa.valor = parseFloat(novasConfig.valor_rifa);
    salvarRifa(req.usuario.id, req.params.rifaId, rifa);
    res.json({ success: true });
});

app.get('/api/user/rifa/:rifaId/exportar', authUsuario, (req, res) => {
    const rifa = carregarRifa(req.usuario.id, req.params.rifaId);
    if (!rifa) return res.status(404).json({ error: 'Rifa não encontrada!' });
    const vendasConfirmadas = rifa.vendas.filter(v => v.status_pagamento === 'confirmado');
    res.json(vendasConfirmadas);
});

// ============================================
// ROTAS MASTER ADMIN
// ============================================

app.get('/api/master/usuarios', authAdmin, (req, res) => {
    const usuarios = carregarUsuarios();
    res.json(usuarios.map(u => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        empresa: u.empresa,
        data_criacao: u.data_criacao,
        total_rifas: u.rifas.length
    })));
});

app.get('/api/master/usuario/:usuarioId/rifas', authAdmin, (req, res) => {
    const rifas = carregarRifas(req.params.usuarioId);
    res.json(rifas);
});

// ============================================
// ROTAS ESTÁTICAS
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/rifa/:usuarioId/:rifaId', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'rifa.html'));
});

app.get('/master', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'master.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================
// Inicia o servidor mesmo sem MySQL (não trava)
initMySQL();
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 SISTEMA DE RIFA MULTI-USUÁRIO');
    console.log('='.repeat(50));
    console.log(`📱 Login: http://localhost:${PORT}`);
    console.log(`👨‍💼 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`🔐 Master Admin: http://localhost:${PORT}/admin`);
    console.log(`🔑 Senha Master: ${ADMIN_PASSWORD}`);
    console.log('='.repeat(50));
});
