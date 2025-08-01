#!/bin/bash

# Script para conectar à VPS e fazer git pull
VPS_IP="82.25.69.57"
VPS_USER="root"

echo "🚀 Conectando à VPS $VPS_IP..."
echo "Digite a senha quando solicitado:"

# Função para executar comandos na VPS
execute_vps_commands() {
    ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP << 'EOF'
echo "✅ Conectado à VPS com sucesso!"
echo "📍 Diretório atual: $(pwd)"

# Encontrar diretório do projeto
echo "🔍 Procurando diretório recultrabase..."
if [ -d "/root/recultrabase" ]; then
    PROJECT_DIR="/root/recultrabase"
elif [ -d "/home/recultrabase" ]; then
    PROJECT_DIR="/home/recultrabase"
elif [ -d "~/recultrabase" ]; then
    PROJECT_DIR="~/recultrabase"
else
    PROJECT_DIR=$(find / -name "recultrabase" -type d 2>/dev/null | head -1)
fi

if [ -z "$PROJECT_DIR" ]; then
    echo "❌ Diretório recultrabase não encontrado!"
    echo "📂 Diretórios disponíveis:"
    ls -la /root/
    ls -la /home/ 2>/dev/null || true
    exit 1
fi

echo "📂 Projeto encontrado em: $PROJECT_DIR"
cd "$PROJECT_DIR"

echo "📋 Status atual do git:"
git status

echo "📜 Últimos commits:"
git log --oneline -3

echo "🔄 Fazendo git pull..."
git pull origin main

echo "📜 Commits após pull:"
git log --oneline -3

echo "🔍 Verificando processos Node.js:"
ps aux | grep node | grep -v grep

echo "🔄 Tentando reiniciar servidor..."

# Verificar se PM2 está disponível
if command -v pm2 &> /dev/null; then
    echo "📦 Usando PM2 para reiniciar:"
    pm2 list
    pm2 restart all
    pm2 list
elif systemctl list-units --type=service | grep -q ultrabase; then
    echo "🔧 Usando systemctl para reiniciar:"
    sudo systemctl restart ultrabase
    sudo systemctl status ultrabase --no-pager
else
    echo "⚠️ Reinicialização manual necessária"
    echo "🔍 Processos Node atuais:"
    ps aux | grep node | grep -v grep
    echo "💡 Para reiniciar manualmente:"
    echo "  pkill -f node"
    echo "  cd src && node server.js"
fi

echo "🌐 Verificando se servidor está rodando na porta 3080:"
netstat -tlnp | grep 3080 || echo "❌ Porta 3080 não está em uso"

echo "✅ Atualização concluída!"
echo "🌐 Teste no navegador: http://82.25.69.57:3080"
echo "🔧 Console do navegador deve mostrar: '🔧 DEBUG: JavaScript carregado, DOM pronto'"

EOF
}

# Executar comandos
execute_vps_commands