const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('views'));
app.use('/uploads', express.static('uploads'));

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `rifa-logo-${Date.now()}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// ============================================
// BANCO DE DADOS SQLITE - VERSÃO SIMPLIFICADA
// ============================================
// Tenta usar /tmp/ se existir (Hostinger), senão usa local
let dbPath = 'rifa.db';
try {
    // Testa se /tmp/ tem permissão de escrita
    fs.accessSync('/tmp/', fs.constants.W_OK);
    dbPath = '/tmp/rifa.db';
    console.log('📁 Usando /tmp/ para o banco de dados');
} catch (err) {
    console.log('📁 Usando diretório local para o banco de dados');
}

const db = new sqlite3.Database(dbPath);
console.log(`📁 Banco de dados: ${dbPath}`);

// Criar tabelas
db.serialize(() => {
    // Tabela de números
    db.run(`
        CREATE TABLE IF NOT EXISTS numeros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero INTEGER UNIQUE,
            status TEXT DEFAULT 'disponivel',
            comprador_nome TEXT,
            comprador_telefone TEXT,
            comprador_email TEXT,
            comprovante_codigo TEXT,
            data_reserva DATETIME,
            data_confirmacao DATETIME
        )
    `);

    // Tabela de vendas
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas (
            id TEXT PRIMARY KEY,
            numero INTEGER,
            nome TEXT,
            telefone TEXT,
            email TEXT,
            comprovante_codigo TEXT,
            qr_code TEXT,
            status_pagamento TEXT DEFAULT 'pendente',
            valor_pago REAL,
            data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
            data_pagamento DATETIME
        )
    `);

    // Tabela de configurações
    db.run(`
        CREATE TABLE IF NOT EXISTS configuracoes (
            chave TEXT PRIMARY KEY,
            valor TEXT,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de sorteios
    db.run(`
        CREATE TABLE IF NOT EXISTS sorteios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero INTEGER,
            ganhador_nome TEXT,
            ganhador_telefone TEXT,
            ganhador_email TEXT,
            data_sorteio DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Verificar se já existem números
    db.get(`SELECT COUNT(*) as total FROM numeros`, (err, row) => {
        if (err) {
            console.error('Erro ao verificar números:', err.message);
        } else if (row && row.total === 0) {
            // Inicializar números 1 a 100
            console.log('📝 Inicializando números 1 a 100...');
            for (let i = 1; i <= 100; i++) {
                db.run(`INSERT INTO numeros (numero, status) VALUES (?, 'disponivel')`, [i]);
            }
            console.log('✅ Números 1 a 100 criados');
        }
    });

    // Configurações padrão
    const configuracoesPadrao = {
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

    for (const [chave, valor] of Object.entries(configuracoesPadrao)) {
        db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)`, [chave, valor]);
    }
});

// ============================================
// ROTAS PÚBLICAS (CLIENTE)
// ============================================

// Listar todos os números com status
app.get('/api/numeros', (req, res) => {
    db.get(`SELECT valor FROM configuracoes WHERE chave = 'rifa_ativa'`, (err, ativaRow) => {
        const rifaAtiva = ativaRow ? ativaRow.valor === 'true' : true;
        
        db.all(`SELECT numero, status FROM numeros ORDER BY numero`, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                rifa_ativa: rifaAtiva,
                numeros: rows
            });
        });
    });
});

// Buscar configurações públicas
app.get('/api/configuracoes', (req, res) => {
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('nome_rifa', 'descricao_rifa', 'valor_rifa', 'chave_pix', 'admin_whatsapp', 'mensagem_boas_vindas', 'instrucoes_pagamento', 'rodape_comprovante', 'rifa_ativa', 'ultimo_ganhador', 'ultimo_ganhador_numero', 'imagem_rifa', 'cor_principal', 'cor_secundaria')`, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const config = {};
        rows.forEach(row => {
            config[row.chave] = row.valor;
        });
        res.json(config);
    });
});

// Buscar último sorteio
app.get('/api/ultimo-sorteio', (req, res) => {
    db.get(`SELECT * FROM sorteios ORDER BY data_sorteio DESC LIMIT 1`, (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row || null);
    });
});

// Reservar um número
app.post('/api/reservar', async (req, res) => {
    const { numero, nome, telefone, email } = req.body;

    db.get(`SELECT valor FROM configuracoes WHERE chave = 'rifa_ativa'`, async (err, ativaRow) => {
        if (ativaRow && ativaRow.valor === 'false') {
            return res.status(400).json({ error: 'Esta rifa já foi finalizada! Aguarde a próxima rifa.' });
        }

        if (!numero || !nome || !telefone || !email) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        db.get(`SELECT valor FROM configuracoes WHERE chave = 'valor_rifa'`, async (err, valorRow) => {
            const valorRifa = valorRow ? parseFloat(valorRow.valor) : 10.00;
            
            db.get(`SELECT valor FROM configuracoes WHERE chave = 'chave_pix'`, async (err, pixRow) => {
                const chavePix = pixRow ? pixRow.valor : 'admin@rifa.com';
                
                db.get(`SELECT status FROM numeros WHERE numero = ?`, [numero], async (err, row) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    if (!row || row.status !== 'disponivel') {
                        return res.status(400).json({ error: 'Número já reservado ou vendido' });
                    }

                    const comprovanteId = uuidv4();
                    const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
                    const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo);
                    
                    db.serialize(() => {
                        db.run(`BEGIN TRANSACTION`);
                        
                        db.run(`
                            UPDATE numeros 
                            SET status = 'reservado',
                                comprador_nome = ?,
                                comprador_telefone = ?,
                                comprador_email = ?,
                                comprovante_codigo = ?,
                                data_reserva = CURRENT_TIMESTAMP
                            WHERE numero = ?
                        `, [nome, telefone, email, comprovanteCodigo, numero]);
                        
                        db.run(`
                            INSERT INTO vendas (id, numero, nome, telefone, email, comprovante_codigo, qr_code, valor_pago, status_pagamento)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
                        `, [comprovanteId, numero, nome, telefone, email, comprovanteCodigo, qrCodeDataUrl, valorRifa]);
                        
                        db.run(`COMMIT`, (err) => {
                            if (err) {
                                db.run(`ROLLBACK`);
                                return res.status(500).json({ error: 'Erro ao processar reserva' });
                            }
                            
                            db.get(`SELECT valor FROM configuracoes WHERE chave = 'mensagem_boas_vindas'`, (err, boasVindasRow) => {
                                db.get(`SELECT valor FROM configuracoes WHERE chave = 'instrucoes_pagamento'`, (err, instrucoesRow) => {
                                    db.get(`SELECT valor FROM configuracoes WHERE chave = 'rodape_comprovante'`, (err, rodapeRow) => {
                                        db.get(`SELECT valor FROM configuracoes WHERE chave = 'nome_rifa'`, (err, nomeRifaRow) => {
                                            
                                            res.json({
                                                success: true,
                                                comprovante: comprovanteCodigo,
                                                qrCode: qrCodeDataUrl,
                                                numero: numero,
                                                valor: valorRifa,
                                                chave_pix: chavePix,
                                                data: new Date().toISOString(),
                                                nome_rifa: nomeRifaRow ? nomeRifaRow.valor : 'MEGA RIFA',
                                                mensagem_boas_vindas: boasVindasRow ? boasVindasRow.valor : '',
                                                instrucoes_pagamento: instrucoesRow ? instrucoesRow.valor : '',
                                                rodape_comprovante: rodapeRow ? rodapeRow.valor : ''
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ============================================
// ROTAS ADMINISTRATIVAS
// ============================================

app.get('/api/admin/dashboard', (req, res) => {
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM numeros WHERE status = 'disponivel') as disponiveis,
            (SELECT COUNT(*) FROM numeros WHERE status = 'reservado') as reservados,
            (SELECT COUNT(*) FROM numeros WHERE status = 'pago') as pagos,
            (SELECT COUNT(*) FROM vendas WHERE status_pagamento = 'pendente') as pendentes,
            (SELECT COUNT(*) FROM vendas WHERE status_pagamento = 'confirmado') as confirmados,
            (SELECT COALESCE(SUM(valor_pago), 0) FROM vendas WHERE status_pagamento = 'confirmado') as total_arrecadado,
            (SELECT valor FROM configuracoes WHERE chave = 'rifa_ativa') as rifa_ativa
    `, (err, stats) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(stats);
    });
});

app.get('/api/admin/vendas', (req, res) => {
    db.all(`SELECT v.*, n.status as numero_status FROM vendas v JOIN numeros n ON v.numero = n.numero WHERE v.status_pagamento = 'pendente' ORDER BY v.data_pedido DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/numeros', (req, res) => {
    db.all(`SELECT n.*, v.comprovante_codigo, v.data_pedido, v.status_pagamento FROM numeros n LEFT JOIN vendas v ON n.numero = v.numero ORDER BY n.numero`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/confirmar-pagamento', (req, res) => {
    const { venda_id, numero } = req.body;
    db.serialize(() => {
        db.run(`BEGIN TRANSACTION`);
        db.run(`UPDATE vendas SET status_pagamento = 'confirmado', data_pagamento = CURRENT_TIMESTAMP WHERE id = ?`, [venda_id]);
        db.run(`UPDATE numeros SET status = 'pago', data_confirmacao = CURRENT_TIMESTAMP WHERE numero = ?`, [numero]);
        db.run(`COMMIT`, (err) => {
            if (err) { db.run(`ROLLBACK`); return res.status(500).json({ error: 'Erro ao confirmar pagamento' }); }
            res.json({ success: true });
        });
    });
});

app.post('/api/admin/cancelar-venda', (req, res) => {
    const { venda_id, numero } = req.body;
    db.serialize(() => {
        db.run(`BEGIN TRANSACTION`);
        db.run(`UPDATE vendas SET status_pagamento = 'cancelado' WHERE id = ?`, [venda_id]);
        db.run(`UPDATE numeros SET status = 'disponivel', comprador_nome = NULL, comprador_telefone = NULL, comprador_email = NULL, comprovante_codigo = NULL, data_reserva = NULL WHERE numero = ?`, [numero]);
        db.run(`COMMIT`, (err) => {
            if (err) { db.run(`ROLLBACK`); return res.status(500).json({ error: 'Erro ao cancelar venda' }); }
            res.json({ success: true });
        });
    });
});

app.get('/api/admin/exportar', (req, res) => {
    db.all(`SELECT numero, nome, telefone, email, valor_pago, data_pedido, data_pagamento, comprovante_codigo FROM vendas WHERE status_pagamento = 'confirmado' ORDER BY numero`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ============================================
// ROTAS DE SORTEIO
// ============================================

app.post('/api/admin/sortear', (req, res) => {
    db.all(`SELECT numero, comprador_nome, comprador_telefone, comprador_email, data_confirmacao FROM numeros WHERE status = 'pago'`, (err, pagos) => {
        if (err) return res.status(500).json({ error: err.message });
        if (pagos.length === 0) return res.status(400).json({ error: 'Não há números pagos para sortear!' });
        
        const sorteado = pagos[Math.floor(Math.random() * pagos.length)];
        db.run(`INSERT INTO sorteios (numero, ganhador_nome, ganhador_telefone, ganhador_email, data_sorteio) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [sorteado.numero, sorteado.comprador_nome, sorteado.comprador_telefone, sorteado.comprador_email]);
        db.run(`UPDATE configuracoes SET valor = 'false' WHERE chave = 'rifa_ativa'`);
        db.run(`UPDATE configuracoes SET valor = ? WHERE chave = 'ultimo_ganhador'`, [sorteado.comprador_nome]);
        db.run(`UPDATE configuracoes SET valor = ? WHERE chave = 'ultimo_ganhador_numero'`, [sorteado.numero]);
        
        res.json({ success: true, numero: sorteado.numero, nome: sorteado.comprador_nome, telefone: sorteado.comprador_telefone, email: sorteado.comprador_email, data_compra: sorteado.data_confirmacao });
    });
});

app.get('/api/admin/historico-sorteios', (req, res) => {
    db.all(`SELECT * FROM sorteios ORDER BY data_sorteio DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ============================================
// ROTAS DE NOVA RIFA E UPLOAD
// ============================================

app.post('/api/admin/nova-rifa', (req, res) => {
    const { nome, quantidade } = req.body;
    const qtd = parseInt(quantidade) || 100;
    
    db.serialize(() => {
        db.run(`BEGIN TRANSACTION`);
        db.run(`DELETE FROM numeros`);
        db.run(`DELETE FROM vendas`);
        db.run(`DELETE FROM sorteios`);
        
        for (let i = 1; i <= qtd; i++) {
            db.run(`INSERT INTO numeros (numero, status) VALUES (?, 'disponivel')`, [i]);
        }
        
        db.run(`UPDATE configuracoes SET valor = 'true' WHERE chave = 'rifa_ativa'`);
        db.run(`UPDATE configuracoes SET valor = '' WHERE chave = 'ultimo_ganhador'`);
        db.run(`UPDATE configuracoes SET valor = '' WHERE chave = 'ultimo_ganhador_numero'`);
        
        if (nome && nome.trim()) {
            db.run(`UPDATE configuracoes SET valor = ? WHERE chave = 'nome_rifa'`, [nome]);
        }
        
        db.run(`COMMIT`, (err) => {
            if (err) { db.run(`ROLLBACK`); return res.status(500).json({ error: 'Erro ao gerar nova rifa' }); }
            res.json({ success: true, message: `Nova rifa com ${qtd} números criada com sucesso!` });
        });
    });
});

app.post('/api/admin/upload-imagem', upload.single('imagem'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const imagemUrl = `/uploads/${req.file.filename}`;
    db.run(`UPDATE configuracoes SET valor = ? WHERE chave = 'imagem_rifa'`, [imagemUrl]);
    res.json({ success: true, url: imagemUrl });
});

app.post('/api/admin/remover-imagem', (req, res) => {
    db.run(`UPDATE configuracoes SET valor = '' WHERE chave = 'imagem_rifa'`);
    res.json({ success: true });
});

// ============================================
// ROTAS DE CONFIGURAÇÃO
// ============================================

app.get('/api/admin/configuracoes', (req, res) => {
    db.all(`SELECT chave, valor FROM configuracoes`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const config = {};
        rows.forEach(row => { config[row.chave] = row.valor; });
        res.json(config);
    });
});

app.post('/api/admin/configuracoes', (req, res) => {
    const config = req.body;
    db.serialize(() => {
        db.run(`BEGIN TRANSACTION`);
        for (const [chave, valor] of Object.entries(config)) {
            db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, CURRENT_TIMESTAMP)`, [chave, valor]);
        }
        db.run(`COMMIT`, (err) => {
            if (err) { db.run(`ROLLBACK`); return res.status(500).json({ error: 'Erro ao salvar configurações' }); }
            res.json({ success: true });
        });
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
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 SISTEMA DE RIFA - SERVIDOR RODANDO');
    console.log('='.repeat(50));
    console.log(`📱 Site do Cliente: http://localhost:${PORT}`);
    console.log(`👨‍💼 Painel Admin: http://localhost:${PORT}/admin`);
    console.log(`💾 Banco de Dados: ${dbPath}`);
    console.log('='.repeat(50));
});

server.on('error', (err) => {
    console.error('❌ Erro no servidor:', err);
});

process.on('SIGINT', () => {
    console.log('\n📴 Encerrando servidor...');
    db.close(() => process.exit(0));
});
