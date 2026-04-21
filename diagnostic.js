const fs = require('fs');
const path = require('path');

console.log('\n🔍 DIAGNÓSTICO DO SISTEMA');
console.log('='.repeat(50));

// Verificar diretórios
const dirsToCheck = ['data', 'data/usuarios', 'data/rifas', 'data_backup', 'backup_manual'];
console.log('\n📁 DIRETÓRIOS:');
dirsToCheck.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    const exists = fs.existsSync(fullPath);
    console.log(`${exists ? '✅' : '❌'} ${dir}`);
});

// Verificar arquivo de usuários
const usersFile = path.join(__dirname, 'data/usuarios/lista.json');
console.log('\n👥 USUÁRIOS:');
if (fs.existsSync(usersFile)) {
    try {
        const content = fs.readFileSync(usersFile, 'utf8');
        const users = JSON.parse(content);
        console.log(`✅ Encontrados ${users.length} usuários cadastrados`);
        users.forEach(user => {
            console.log(`   📌 ${user.nome} (${user.email})`);
            console.log(`      Rifas: ${user.rifas?.length || 0}`);
        });
    } catch (err) {
        console.log(`❌ Erro ao ler arquivo: ${err.message}`);
    }
} else {
    console.log('❌ Nenhum usuário cadastrado ainda');
}

// Verificar backups
const backupDir = path.join(__dirname, 'backup_manual');
console.log('\n💾 BACKUPS DISPONÍVEIS:');
if (fs.existsSync(backupDir)) {
    const backups = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_'));
    if (backups.length > 0) {
        backups.forEach(backup => {
            console.log(`   📦 ${backup}`);
        });
    } else {
        console.log('   Nenhum backup manual encontrado');
    }
} else {
    console.log('   Pasta de backup não existe');
}

// Verificar espaço em disco
console.log('\n💿 INFORMAÇÕES DO SISTEMA:');
console.log(`📂 Diretório atual: ${__dirname}`);
console.log(`🕒 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

console.log('\n✅ Diagnóstico concluído!\n');
