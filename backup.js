const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'backup_manual');

function fazerBackup() {
    const data = new Date();
    const timestamp = `${data.getFullYear()}-${data.getMonth()+1}-${data.getDate()}_${data.getHours()}-${data.getMinutes()}`;
    const backupName = `backup_${timestamp}`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    // Criar diretório de backup se não existir
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log('📁 Pasta de backup criada');
    }
    
    // Verificar se existe dados para backup
    if (fs.existsSync(DATA_DIR)) {
        // Copiar pasta data
        fs.cpSync(DATA_DIR, backupPath, { recursive: true });
        
        // Criar arquivo de info
        const info = {
            timestamp: new Date().toISOString(),
            backup_name: backupName,
            files_count: fs.readdirSync(backupPath, { recursive: true }).length
        };
        
        fs.writeFileSync(path.join(backupPath, 'backup_info.json'), JSON.stringify(info, null, 2));
        
        console.log('✅ Backup concluído!');
        console.log(`📦 Local: ${backupPath}`);
        console.log(`📊 Arquivos: ${info.files_count}`);
    } else {
        console.log('❌ Pasta "data" não encontrada. Nenhum dado para backup.');
    }
}

// Executar backup
console.log('🔄 Iniciando backup manual...');
fazerBackup();
