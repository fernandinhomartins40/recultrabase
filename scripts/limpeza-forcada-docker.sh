#!/bin/bash

# 🧹 SCRIPT DE LIMPEZA FORÇADA - DOCKER
# 
# ATENÇÃO: Execute apenas em emergência ou para limpeza preventiva
# Este script remove TODOS os recursos Docker órfãos do sistema
#
# Data: 31/07/2025
# Por: Sistema Ultrabase

echo "🧹 INICIANDO LIMPEZA FORÇADA DO DOCKER..."
echo "⚠️  ATENÇÃO: Este script remove recursos órfãos de TODAS as aplicações Docker"
echo ""

# Função para mostrar uso antes
show_usage_before() {
    echo "📊 USO ATUAL DO DOCKER:"
    docker system df -v
    echo ""
}

# Função para mostrar uso depois  
show_usage_after() {
    echo "📊 USO APÓS LIMPEZA:"
    docker system df -v
    echo ""
}

# Função de limpeza gradual
cleanup_step() {
    local step_name="$1"
    local command="$2"
    
    echo "🔹 $step_name..."
    if eval "$command"; then
        echo "  ✅ $step_name concluído"
    else
        echo "  ⚠️ $step_name falhou (pode ser normal se não houver recursos órfãos)"
    fi
    echo ""
}

# Mostrar uso inicial
show_usage_before

# Passo 1: Remover containers parados
cleanup_step "Removendo containers parados" "docker container prune -f"

# Passo 2: Remover volumes órfãos  
cleanup_step "Removendo volumes órfãos" "docker volume prune -f"

# Passo 3: Remover imagens órfãs (não usadas)
cleanup_step "Removendo imagens órfãs" "docker image prune -f"

# Passo 4: Remover redes órfãs
cleanup_step "Removendo redes órfãs" "docker network prune -f"

# Passo 5: Limpeza completa do cache de build (CUIDADO)
read -p "🤔 Deseja limpar o cache de build Docker? Isso pode demorar na próxima build (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cleanup_step "Removendo cache de build" "docker builder prune -f"
fi

# LIMPEZA AGRESSIVA (apenas se solicitado)
echo ""
echo "🚨 LIMPEZA AGRESSIVA DISPONÍVEL:"
echo "   Esta opção remove TUDO que não está sendo usado ativamente"
echo "   ⚠️  CUIDADO: Pode afetar outras aplicações Docker"
echo ""
read -p "Executar limpeza agressiva? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚨 EXECUTANDO LIMPEZA AGRESSIVA..."
    cleanup_step "Limpeza completa do sistema" "docker system prune -a --volumes -f"
else
    echo "✅ Limpeza conservadora concluída"
fi

# Mostrar resultado final
echo ""
echo "🎯 RESULTADO DA LIMPEZA:"
show_usage_after

# Estatísticas
echo "📈 RECOMENDAÇÕES:"
echo "✅ Execute este script mensalmente para manutenção preventiva"
echo "✅ Monitore o uso com: docker system df"
echo "✅ Se uso > 80%, execute limpeza imediatamente"
echo ""

echo "🏁 LIMPEZA CONCLUÍDA!"