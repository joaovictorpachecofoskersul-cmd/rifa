const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'views')));

// ============================================
// 🔴 CONFIGURAÇÃO DO BANCO - COLOQUE SUA SENHA AQUI!
// ============================================
const DB_CONFIG = {
    host: 'localhost',
    user: 'u519611382_rifa',
    password: 'SUA_SENHA_AQUI',  // 🔴🔴🔴 MUDE AQUI 🔴🔴🔴
    database: 'u519611382_rifa',
    waitForConnections: true,
    connectionLimit: 10
};

let pool;

// ============================================
// INICIALIZAR BANCO DE DADOS
// ============================================
async function initDatabase() {
    pool = mysql.createPool(DB_CONFIG);
    
    const connection = await pool.getConnection();
    
    // Criar tabela de configurações
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS configuracoes (
            id INT PRIMARY KEY DEFAULT 1,
            nome_rifa VARCHAR(255) DEFAULT 'MEGA RIFA PREMIUM',
            descricao_rifa TEXT DEFAULT '🏆 Prêmio: R$ 10.000,00 + Moto 0km',
            valor_rifa DECIMAL(10,2) DEFAULT 10.00,
            chave_pix VARCHAR(255) DEFAULT 'admin@rifa.com',
            admin_whatsapp VARCHAR(50) DEFAULT '55999999999',
            rifa_ativa VARCHAR(10) DEFAULT 'true',
            ultimo_ganhador VARCHAR(255) DEFAULT '',
            ultimo_ganhador_numero VARCHAR(50) DEFAULT '',
            imagem_rifa TEXT,
            cor_principal VARCHAR(50) DEFAULT '#667eea',
            cor_secundaria VARCHAR(50) DEFAULT '#764ba2',
            mensagem_boas_vindas TEXT DEFAULT 'Obrigado por participar da nossa rifa!',
            instrucoes_pagamento TEXT DEFAULT '1. Faça o PIX para a chave acima\\n2. Envie o comprovante\\n3. Aguarde a confirmação',
            rodape_comprovante TEXT DEFAULT 'Boa sorte! 🍀\\nSorteio ao atingir 100 números',
            mensagem_whatsapp TEXT DEFAULT 'Olá {nome}!\\n✅ Pagamento CONFIRMADO!\\nNúmero: {numero}\\nBoa sorte! 🍀',
            mensagem_ganhador TEXT DEFAULT '🎉 PARABÉNS {nome}!\\nNúmero: {numero}\\nEntre em contato! 🏆'
        )
    `);
    
    // Criar tabela de números
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS numeros (
            numero INT PRIMARY KEY,
            status ENUM('disponivel', 'reservado', 'pago') DEFAULT 'disponivel',
            comprador_nome VARCHAR(255),
            comprador_telefone VARCHAR(50),
            comprador_email VARCHAR(255),
            comprovante_codigo VARCHAR(100),
            data_reserva DATETIME,
            data_confirmacao DATETIME
        )
    `);
    
    // Criar tabela de vendas
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS vendas (
            id VARCHAR(100) PRIMARY KEY,
            numero INT,
            nome VARCHAR(255),
            telefone VARCHAR(50),
            email VARCHAR(255),
            comprovante_codigo VARCHAR(100),
            qr_code TEXT,
            status_pagamento ENUM('pendente', 'confirmado', 'cancelado') DEFAULT 'pendente',
            valor_pago DECIMAL(10,2),
            data_pedido DATETIME,
            data_pagamento DATETIME
        )
    `);
    
    // Criar tabela de sorteios
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS sorteios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            numero INT,
            ganhador_nome VARCHAR(255),
            ganhador_telefone VARCHAR(50),
            ganhador_email VARCHAR(255),
            data_sorteio DATETIME
        )
    `);
    
    // Inserir números de 1 a 100
    for (let i = 1; i <= 100; i++) {
        await connection.execute(
            'INSERT IGNORE INTO numeros (numero) VALUES (?)',
            [i]
        );
    }
    
    // Inserir configuração padrão se não existir
    await connection.execute(
        `INSERT IGNORE INTO configuracoes (id) VALUES (1)`
    );
    
    connection.release();
    console.log('✅ Banco de dados MySQL conectado e tabelas criadas!');
}

// ============================================
// FUNÇÕES DE ACESSO AO BANCO
// ============================================

async function getConfig() {
    const [rows] = await pool.execute('SELECT * FROM configuracoes WHERE id = 1');
    return rows[0];
}

async function updateConfig(config) {
    await pool.execute('UPDATE configuracoes SET ? WHERE id = 1', [config]);
}

async function getNumeros() {
    const [rows] = await pool.execute('SELECT * FROM numeros ORDER BY numero');
    return rows;
}

async function updateNumero(numero, data) {
    await pool.execute('UPDATE numeros SET ? WHERE numero = ?', [data, numero]);
}

// ============================================
// ROTAS PÚBLICAS
// ============================================

app.get('/api/numeros', async (req, res) => {
    try {
        const config = await getConfig();
        const numeros = await getNumeros();
        res.json({
            rifa_ativa: config.rifa_ativa === 'true',
            numeros: numeros.map(n => ({ numero: n.numero, status: n.status }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/configuracoes', async (req, res) => {
    try {
        const config = await getConfig();
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

app.get('/api/ultimo-sorteio', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM sorteios ORDER BY data_sorteio DESC LIMIT 1');
        res.json(rows[0] || null);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reservar', async (req, res) => {
    try {
        const { numero, nome, telefone, email } = req.body;
        const config = await getConfig();

        if (config.rifa_ativa === 'false') {
            return res.status(400).json({ error: 'Rifa finalizada!' });
        }

        const numeros = await getNumeros();
        const numeroObj = numeros.find(n => n.numero === numero);
        
        if (!numeroObj || numeroObj.status !== 'disponivel') {
            return res.status(400).json({ error: 'Número indisponível' });
        }

        const comprovanteId = uuidv4();
        const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
        const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo);
        const valorRifa = parseFloat(config.valor_rifa);

        await updateNumero(numero, {
            status: 'reservado',
            comprador_nome: nome,
            comprador_telefone: telefone,
            comprador_email: email,
            comprovante_codigo: comprovanteCodigo,
            data_reserva: new Date()
        });

        await pool.execute(
            `INSERT INTO vendas (id, numero, nome, telefone, email, comprovante_codigo, qr_code, status_pagamento, valor_pago, data_pedido)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`,
            [comprovanteId, numero, nome, telefone, email, comprovanteCodigo, qrCodeDataUrl, valorRifa, new Date()]
        );

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
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTAS ADMIN
// ============================================

app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const numeros = await getNumeros();
        const [vendasRows] = await pool.execute('SELECT * FROM vendas');
        
        const disponiveis = numeros.filter(n => n.status === 'disponivel').length;
        const reservados = numeros.filter(n => n.status === 'reservado').length;
        const pagos = numeros.filter(n => n.status === 'pago').length;
        const pendentes = vendasRows.filter(v => v.status_pagamento === 'pendente').length;
        const confirmados = vendasRows.filter(v => v.status_pagamento === 'confirmado').length;
        const total_arrecadado = vendasRows.filter(v => v.status_pagamento === 'confirmado').reduce((sum, v) => sum + parseFloat(v.valor_pago), 0);

        res.json({ disponiveis, reservados, pagos, pendentes, confirmados, total_arrecadado });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/vendas', async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT * FROM vendas WHERE status_pagamento = 'pendente'");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/numeros', async (req, res) => {
    try {
        const numeros = await getNumeros();
        res.json(numeros);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/confirmar-pagamento', async (req, res) => {
    try {
        const { venda_id, numero } = req.body;
        
        await pool.execute('UPDATE vendas SET status_pagamento = "confirmado", data_pagamento = ? WHERE id = ?', [new Date(), venda_id]);
        await updateNumero(numero, { status: 'pago', data_confirmacao: new Date() });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/cancelar-venda', async (req, res) => {
    try {
        const { venda_id, numero } = req.body;
        
        await pool.execute('UPDATE vendas SET status_pagamento = "cancelado" WHERE id = ?', [venda_id]);
        await updateNumero(numero, {
            status: 'disponivel',
            comprador_nome: null,
            comprador_telefone: null,
            comprador_email: null,
            comprovante_codigo: null,
            data_reserva: null,
            data_confirmacao: null
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/exportar', async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT * FROM vendas WHERE status_pagamento = 'confirmado'");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/sortear', async (req, res) => {
    try {
        const numeros = await getNumeros();
        const pagos = numeros.filter(n => n.status === 'pago');
        
        if (pagos.length === 0) {
            return res.status(400).json({ error: 'Não há números pagos!' });
        }
        
        const sorteado = pagos[Math.floor(Math.random() * pagos.length)];
        
        await pool.execute(
            `INSERT INTO sorteios (numero, ganhador_nome, ganhador_telefone, ganhador_email, data_sorteio)
             VALUES (?, ?, ?, ?, ?)`,
            [sorteado.numero, sorteado.comprador_nome, sorteado.comprador_telefone, sorteado.comprador_email, new Date()]
        );
        
        const config = await getConfig();
        config.rifa_ativa = 'false';
        config.ultimo_ganhador = sorteado.comprador_nome;
        config.ultimo_ganhador_numero = sorteado.numero;
        await updateConfig(config);
        
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

app.get('/api/admin/historico-sorteios', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM sorteios ORDER BY data_sorteio DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/configuracoes', async (req, res) => {
    try {
        const config = await getConfig();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/configuracoes', async (req, res) => {
    try {
        const novasConfig = req.body;
        await updateConfig(novasConfig);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('='.repeat(50));
        console.log('🚀 SISTEMA DE RIFA COM MYSQL');
        console.log('='.repeat(50));
        console.log(`📱 Site: http://localhost:${PORT}`);
        console.log(`👨‍💼 Admin: http://localhost:${PORT}/admin`);
        console.log(`💾 Banco: MySQL (persistente)`);
        console.log('='.repeat(50));
    });
}).catch(err => {
    console.error('❌ Erro no MySQL:', err.message);
    console.error('🔴 Verifique sua senha no DB_CONFIG!');
    process.exit(1);
});
