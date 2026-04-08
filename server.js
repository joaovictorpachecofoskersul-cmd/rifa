const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000; 

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('views'));

// ============================================
// BANCO DE DADOS SQLITE
// ============================================
const db = new sqlite3.Database('/home/u1234567/domains/seu-dominio/public_html/rifa.db');

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

  // Inicializar números 1 a 100
  for (let i = 1; i <= 100; i++) {
    db.run(`INSERT OR IGNORE INTO numeros (numero, status) VALUES (?, 'disponivel')`, [i]);
  }

  // Configurações padrão
  const configuracoesPadrao = {
    nome_rifa: 'MEGA RIFA PREMIUM',
    descricao_rifa: '🏆 Prêmio: R$ 10.000,00 + Moto 0km',
    valor_rifa: '10.00',
    chave_pix: 'admin@rifa.com',
    admin_whatsapp: '65992270913',
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
  db.all(`SELECT numero, status FROM numeros ORDER BY numero`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Buscar configurações públicas (para o cliente)
app.get('/api/configuracoes', (req, res) => {
  db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('nome_rifa', 'descricao_rifa', 'valor_rifa', 'chave_pix', 'admin_whatsapp', 'mensagem_boas_vindas', 'instrucoes_pagamento', 'rodape_comprovante')`, (err, rows) => {
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

// Reservar um número
app.post('/api/reservar', async (req, res) => {
  const { numero, nome, telefone, email } = req.body;

  // Validação dos campos
  if (!numero || !nome || !telefone || !email) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  // Buscar valor da rifa e chave PIX nas configurações
  db.get(`SELECT valor FROM configuracoes WHERE chave = 'valor_rifa'`, async (err, valorRow) => {
    const valorRifa = valorRow ? parseFloat(valorRow.valor) : 10.00;
    
    db.get(`SELECT valor FROM configuracoes WHERE chave = 'chave_pix'`, async (err, pixRow) => {
      const chavePix = pixRow ? pixRow.valor : 'admin@rifa.com';
      
      // Verificar se número está disponível
      db.get(`SELECT status FROM numeros WHERE numero = ?`, [numero], async (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        if (!row || row.status !== 'disponivel') {
          return res.status(400).json({ error: 'Número já reservado ou vendido' });
        }

        // Gerar comprovante único
        const comprovanteId = uuidv4();
        const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
        
        // Gerar QR Code
        const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo);
        
        // Iniciar transação
        db.serialize(() => {
          db.run(`BEGIN TRANSACTION`);
          
          // Atualizar número como reservado
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
          
          // Inserir venda pendente
          db.run(`
            INSERT INTO vendas (id, numero, nome, telefone, email, comprovante_codigo, qr_code, valor_pago, status_pagamento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
          `, [comprovanteId, numero, nome, telefone, email, comprovanteCodigo, qrCodeDataUrl, valorRifa]);
          
          db.run(`COMMIT`, (err) => {
            if (err) {
              db.run(`ROLLBACK`);
              return res.status(500).json({ error: 'Erro ao processar reserva' });
            }
            
            // Buscar mensagens do comprovante
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

// Verificar comprovante
app.get('/api/verificar/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  
  db.get(`
    SELECT v.*, n.status as numero_status
    FROM vendas v
    JOIN numeros n ON v.numero = n.numero
    WHERE v.comprovante_codigo = ?
  `, [codigo], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Comprovante inválido' });
    }
    res.json(row);
  });
});

// ============================================
// ROTAS ADMINISTRATIVAS
// ============================================

// Dashboard - Estatísticas
app.get('/api/admin/dashboard', (req, res) => {
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM numeros WHERE status = 'disponivel') as disponiveis,
      (SELECT COUNT(*) FROM numeros WHERE status = 'reservado') as reservados,
      (SELECT COUNT(*) FROM numeros WHERE status = 'pago') as pagos,
      (SELECT COUNT(*) FROM vendas WHERE status_pagamento = 'pendente') as pendentes,
      (SELECT COUNT(*) FROM vendas WHERE status_pagamento = 'confirmado') as confirmados,
      (SELECT COALESCE(SUM(valor_pago), 0) FROM vendas WHERE status_pagamento = 'confirmado') as total_arrecadado
  `, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(stats);
  });
});

// Listar todas vendas pendentes (admin)
app.get('/api/admin/vendas', (req, res) => {
  db.all(`
    SELECT v.*, n.status as numero_status
    FROM vendas v
    JOIN numeros n ON v.numero = n.numero
    WHERE v.status_pagamento = 'pendente'
    ORDER BY v.data_pedido DESC
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Listar todos números com detalhes (admin)
app.get('/api/admin/numeros', (req, res) => {
  db.all(`
    SELECT n.*, v.comprovante_codigo, v.data_pedido, v.status_pagamento
    FROM numeros n
    LEFT JOIN vendas v ON n.numero = v.numero
    ORDER BY n.numero
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Confirmar pagamento
app.post('/api/admin/confirmar-pagamento', (req, res) => {
  const { venda_id, numero } = req.body;
  
  if (!venda_id || !numero) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  
  db.serialize(() => {
    db.run(`BEGIN TRANSACTION`);
    
    // Atualizar venda
    db.run(`
      UPDATE vendas 
      SET status_pagamento = 'confirmado',
          data_pagamento = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [venda_id]);
    
    // Atualizar número
    db.run(`
      UPDATE numeros 
      SET status = 'pago',
          data_confirmacao = CURRENT_TIMESTAMP
      WHERE numero = ?
    `, [numero]);
    
    db.run(`COMMIT`, (err) => {
      if (err) {
        db.run(`ROLLBACK`);
        return res.status(500).json({ error: 'Erro ao confirmar pagamento' });
      }
      res.json({ success: true, message: 'Pagamento confirmado com sucesso!' });
    });
  });
});

// Cancelar venda
app.post('/api/admin/cancelar-venda', (req, res) => {
  const { venda_id, numero } = req.body;
  
  if (!venda_id || !numero) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  
  db.serialize(() => {
    db.run(`BEGIN TRANSACTION`);
    
    // Cancelar venda
    db.run(`
      UPDATE vendas 
      SET status_pagamento = 'cancelado'
      WHERE id = ?
    `, [venda_id]);
    
    // Liberar número
    db.run(`
      UPDATE numeros 
      SET status = 'disponivel',
          comprador_nome = NULL,
          comprador_telefone = NULL,
          comprador_email = NULL,
          comprovante_codigo = NULL,
          data_reserva = NULL
      WHERE numero = ?
    `, [numero]);
    
    db.run(`COMMIT`, (err) => {
      if (err) {
        db.run(`ROLLBACK`);
        return res.status(500).json({ error: 'Erro ao cancelar venda' });
      }
      res.json({ success: true, message: 'Venda cancelada e número liberado!' });
    });
  });
});

// Exportar dados (vendas confirmadas)
app.get('/api/admin/exportar', (req, res) => {
  db.all(`
    SELECT 
      numero,
      nome,
      telefone,
      email,
      valor_pago,
      data_pedido,
      data_pagamento,
      comprovante_codigo
    FROM vendas 
    WHERE status_pagamento = 'confirmado'
    ORDER BY numero
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ============================================
// ROTAS DE SORTEIO
// ============================================

// Realizar sorteio
app.post('/api/admin/sortear', (req, res) => {
  // Buscar números pagos
  db.all(`SELECT numero, comprador_nome, comprador_telefone, comprador_email, data_confirmacao 
          FROM numeros 
          WHERE status = 'pago'`, (err, pagos) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (pagos.length === 0) {
      return res.status(400).json({ error: 'Não há números pagos para sortear!' });
    }
    
    // Escolher número aleatório
    const sorteado = pagos[Math.floor(Math.random() * pagos.length)];
    
    // Salvar no histórico
    db.run(`
      INSERT INTO sorteios (numero, ganhador_nome, ganhador_telefone, ganhador_email, data_sorteio)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [sorteado.numero, sorteado.comprador_nome, sorteado.comprador_telefone, sorteado.comprador_email]);
    
    res.json({
      success: true,
      numero: sorteado.numero,
      nome: sorteado.comprador_nome,
      telefone: sorteado.comprador_telefone,
      email: sorteado.comprador_email,
      data_compra: sorteado.data_confirmacao
    });
  });
});

// Buscar histórico de sorteios
app.get('/api/admin/historico-sorteios', (req, res) => {
  db.all(`SELECT * FROM sorteios ORDER BY data_sorteio DESC`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ============================================
// ROTAS DE CONFIGURAÇÃO (ADMIN)
// ============================================

// Buscar todas configurações
app.get('/api/admin/configuracoes', (req, res) => {
  db.all(`SELECT chave, valor FROM configuracoes`, (err, rows) => {
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

// Salvar configurações
app.post('/api/admin/configuracoes', (req, res) => {
  const config = req.body;
  
  db.serialize(() => {
    db.run(`BEGIN TRANSACTION`);
    
    for (const [chave, valor] of Object.entries(config)) {
      db.run(`
        INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [chave, valor]);
    }
    
    db.run(`COMMIT`, (err) => {
      if (err) {
        db.run(`ROLLBACK`);
        return res.status(500).json({ error: 'Erro ao salvar configurações' });
      }
      res.json({ success: true });
    });
  });
});

// ============================================
// SERVIDOR ESTÁTICO PARA ARQUIVOS HTML
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
app.listen(port, () => {
  console.log('='.repeat(50));
  console.log('🚀 SISTEMA DE RIFA - SERVIDOR RODANDO');
  console.log('='.repeat(50));
  console.log(`📱 Site do Cliente: http://localhost:${port}`);
  console.log(`👨‍💼 Painel Admin: http://localhost:${port}/admin`);
  console.log(`💾 Banco de Dados: rifa.db (SQLite)`);
  console.log('='.repeat(50));
  console.log('\n✅ Status:');
  console.log('- API REST disponível');
  console.log('- Banco de dados inicializado');
  console.log('- Números 1 a 100 criados');
  console.log('- Configurações padrão carregadas');
  console.log('- WhatsApp do admin configurado');
  console.log('- Sistema de sorteio ativado');
  console.log('- Aguardando conexões...\n');
});

// ============================================
// TRATAMENTO DE ERROS
// ============================================

// Fechar conexão com banco ao encerrar
process.on('SIGINT', () => {
  console.log('\n📴 Encerrando servidor...');
  db.close((err) => {
    if (err) {
      console.error('Erro ao fechar banco:', err);
    } else {
      console.log('✅ Banco de dados fechado com sucesso');
    }
    process.exit(0);
  });
});
