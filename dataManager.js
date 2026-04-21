const fs = require('fs');
const path = require('path');

class DataManager {
    constructor() {
        this.primaryDir = path.join(__dirname, 'data');
        this.backupDir = path.join(__dirname, 'data_backup');
        this.init();
    }
    
    init() {
        // Criar diretórios principais
        [this.primaryDir, this.backupDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Criado: ${dir}`);
            }
        });
        
        // Criar subdiretórios
        const subDirs = ['usuarios', 'rifas'];
        subDirs.forEach(sub => {
            const primarySub = path.join(this.primaryDir, sub);
            const backupSub = path.join(this.backupDir, sub);
            
            if (!fs.existsSync(primarySub)) fs.mkdirSync(primarySub, { recursive: true });
            if (!fs.existsSync(backupSub)) fs.mkdirSync(backupSub, { recursive: true });
        });
        
        // Tentar restaurar backup se necessário
        this.tryRestore();
    }
    
    tryRestore() {
        const usersFile = path.join(this.primaryDir, 'usuarios', 'lista.json');
        
        // Se o arquivo principal não existe ou está vazio
        if (!fs.existsSync(usersFile) || fs.statSync(usersFile).size === 0) {
            const backupFile = path.join(this.backupDir, 'usuarios', 'lista.json');
            
            if (fs.existsSync(backupFile) && fs.statSync(backupFile).size > 0) {
                try {
                    const data = fs.readFileSync(backupFile, 'utf8');
                    fs.writeFileSync(usersFile, data);
                    console.log('✅ Backup restaurado automaticamente!');
                } catch (err) {
                    console.error('Erro ao restaurar:', err.message);
                }
            }
        }
    }
    
    saveUsers(users) {
        const usersFile = path.join(this.primaryDir, 'usuarios', 'lista.json');
        const backupFile = path.join(this.backupDir, 'usuarios', 'lista.json');
        
        try {
            // Salvar principal
            fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
            // Salvar backup
            fs.writeFileSync(backupFile, JSON.stringify(users, null, 2));
            return true;
        } catch (err) {
            console.error('Erro ao salvar usuários:', err.message);
            return false;
        }
    }
    
    loadUsers() {
        const usersFile = path.join(this.primaryDir, 'usuarios', 'lista.json');
        
        try {
            if (fs.existsSync(usersFile)) {
                const data = fs.readFileSync(usersFile, 'utf8');
                if (data && data.length > 0) {
                    return JSON.parse(data);
                }
            }
        } catch (err) {
            console.error('Erro ao carregar usuários:', err.message);
        }
        
        // Tentar backup
        try {
            const backupFile = path.join(this.backupDir, 'usuarios', 'lista.json');
            if (fs.existsSync(backupFile)) {
                const data = fs.readFileSync(backupFile, 'utf8');
                if (data && data.length > 0) {
                    console.log('📦 Carregando usuários do backup...');
                    return JSON.parse(data);
                }
            }
        } catch (err) {
            console.error('Erro ao carregar backup:', err.message);
        }
        
        return [];
    }
    
    saveRifa(usuarioId, rifaId, data) {
        const userRifaDir = path.join(this.primaryDir, 'rifas', usuarioId);
        const backupUserDir = path.join(this.backupDir, 'rifas', usuarioId);
        
        // Criar diretórios se não existirem
        if (!fs.existsSync(userRifaDir)) fs.mkdirSync(userRifaDir, { recursive: true });
        if (!fs.existsSync(backupUserDir)) fs.mkdirSync(backupUserDir, { recursive: true });
        
        const rifaFile = path.join(userRifaDir, `${rifaId}.json`);
        const backupFile = path.join(backupUserDir, `${rifaId}.json`);
        
        try {
            fs.writeFileSync(rifaFile, JSON.stringify(data, null, 2));
            fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
            return true;
        } catch (err) {
            console.error('Erro ao salvar rifa:', err.message);
            return false;
        }
    }
    
    loadRifa(usuarioId, rifaId) {
        const rifaFile = path.join(this.primaryDir, 'rifas', usuarioId, `${rifaId}.json`);
        
        try {
            if (fs.existsSync(rifaFile)) {
                return JSON.parse(fs.readFileSync(rifaFile, 'utf8'));
            }
        } catch (err) {
            console.error('Erro ao carregar rifa:', err.message);
        }
        
        // Tentar backup
        try {
            const backupFile = path.join(this.backupDir, 'rifas', usuarioId, `${rifaId}.json`);
            if (fs.existsSync(backupFile)) {
                console.log(`📦 Carregando rifa ${rifaId} do backup...`);
                return JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            }
        } catch (err) {
            console.error('Erro ao carregar rifa do backup:', err.message);
        }
        
        return null;
    }
    
    loadAllRifas(usuarioId) {
        const rifas = [];
        const userRifaDir = path.join(this.primaryDir, 'rifas', usuarioId);
        
        try {
            if (fs.existsSync(userRifaDir)) {
                const files = fs.readdirSync(userRifaDir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const rifaPath = path.join(userRifaDir, file);
                        const rifaData = JSON.parse(fs.readFileSync(rifaPath, 'utf8'));
                        rifas.push(rifaData);
                    }
                }
            }
        } catch (err) {
            console.error('Erro ao carregar rifas:', err.message);
        }
        
        // Se não encontrou, tentar backup
        if (rifas.length === 0) {
            try {
                const backupUserDir = path.join(this.backupDir, 'rifas', usuarioId);
                if (fs.existsSync(backupUserDir)) {
                    const files = fs.readdirSync(backupUserDir);
                    for (const file of files) {
                        if (file.endsWith('.json')) {
                            const rifaPath = path.join(backupUserDir, file);
                            const rifaData = JSON.parse(fs.readFileSync(rifaPath, 'utf8'));
                            rifas.push(rifaData);
                        }
                    }
                    if (rifas.length > 0) {
                        console.log(`📦 Carregadas ${rifas.length} rifas do backup`);
                    }
                }
            } catch (err) {
                console.error('Erro ao carregar rifas do backup:', err.message);
            }
        }
        
        return rifas;
    }
}

module.exports = new DataManager();
