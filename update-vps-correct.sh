#!/bin/bash

# Script para atualizar o projeto na VPS
VPS_IP="82.25.69.57"
VPS_USER="root"
PROJECT_DIR="/opt/supabase-manager"

echo "🚀 Conectando à VPS $VPS_IP..."
echo "📂 Projeto localizado em: $PROJECT_DIR"

ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP << EOF
echo "✅ Conectado à VPS com sucesso!"
echo "📍 Navegando para: $PROJECT_DIR"
cd "$PROJECT_DIR"

echo "📋 Status atual do git:"
git status

echo "📜 Commits atuais:"
git log --oneline -3

echo "🔄 Fazendo git pull origin main..."
git pull origin main

echo "📜 Commits após pull:"
git log --oneline -3

echo "🔍 Verificando processos Node.js ativos:"
ps aux | grep node | grep -v grep

echo "🔍 Verificando PM2:"
if command -v pm2 &> /dev/null; then
    echo "📦 PM2 encontrado. Status atual:"
    pm2 list
    echo "🔄 Reiniciando com PM2..."
    pm2 restart all
    echo "📦 Status após reinício:"
    pm2 list
else
    echo "❌ PM2 não encontrado"
fi

echo "🔍 Verificando serviços systemctl:"
systemctl list-units --type=service | grep -E "(supabase|ultrabase|node)" || echo "Nenhum serviço relacionado encontrado"

echo "🌐 Verificando porta 3080:"
netstat -tlnp | grep 3080 || echo "❌ Porta 3080 não está ativa"

echo "🌐 Testando conectividade local:"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3080 2>/dev/null || echo "Erro na conexão local"

echo "✅ Atualização concluída!"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo "1. Teste no navegador: http://82.25.69.57:3080"
echo "2. Abra Console (F12) e procure por:"
echo "   🔧 DEBUG: JavaScript carregado, DOM pronto"
echo "3. Clique no botão 'Diagnósticos' e veja os logs de debug"
echo ""
echo "🔧 Se o servidor não estiver rodando, execute:"
echo "   cd $PROJECT_DIR/src && node server.js"

EOF