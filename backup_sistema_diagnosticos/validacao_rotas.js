#!/usr/bin/env node

/**
 * Validação de Rotas - Sistema Novo vs Antigo
 * Verifica se as rotas estão registradas corretamente
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3080';

async function validateRoutes() {
    console.log('🔍 VALIDAÇÃO DE ROTAS REGISTRADAS');
    console.log('=' .repeat(50));
    
    const routes = [
        // Novas APIs (Sistema Service Monitor)
        { path: '/api/instances/health-summary', method: 'GET', system: 'NEW' },
        { path: '/api/instances/test-id/health', method: 'GET', system: 'NEW' },
        { path: '/api/instances/test-id/restart-services', method: 'POST', system: 'NEW' },
        { path: '/api/instances/test-id/restart-service/db', method: 'POST', system: 'NEW' },
        
        // APIs antigas (Sistema Diagnósticos)
        { path: '/api/instances/test-id/run-diagnostics', method: 'GET', system: 'OLD' },
        { path: '/api/diagnostics/global-stats', method: 'GET', system: 'OLD' },
        { path: '/api/instances/test-id/diagnostic-history', method: 'GET', system: 'OLD' },
        
        // API pública (funcionando)
        { path: '/api/health', method: 'GET', system: 'PUBLIC' }
    ];
    
    console.log(`\n📝 Testando ${routes.length} rotas...\n`);
    
    const results = [];
    
    for (const route of routes) {
        try {
            const response = await fetch(`${BASE_URL}${route.path}`, {
                method: route.method,
                headers: { 'Content-Type': 'application/json' }
            });
            
            const isRegistered = response.status !== 404;
            const needsAuth = response.status === 401;
            const isPublic = response.status === 200;
            
            let status;
            if (isPublic) status = '🟢 PÚBLICO';
            else if (needsAuth) status = '🟡 AUTENTICADO';
            else if (isRegistered) status = '🔵 REGISTRADO';
            else status = '🔴 NÃO ENCONTRADO';
            
            console.log(`${status} [${route.system}] ${route.method} ${route.path}`);
            
            results.push({
                ...route,
                status: response.status,
                registered: isRegistered,
                needsAuth: needsAuth,
                isPublic: isPublic
            });
            
        } catch (error) {
            console.log(`❌ ERRO [${route.system}] ${route.method} ${route.path} - ${error.message}`);
            results.push({
                ...route,
                status: 500,
                registered: false,
                error: error.message
            });
        }
    }
    
    // Análise dos resultados
    console.log('\n📊 ANÁLISE DOS RESULTADOS');
    console.log('=' .repeat(50));
    
    const newSystemRoutes = results.filter(r => r.system === 'NEW');
    const oldSystemRoutes = results.filter(r => r.system === 'OLD');
    const publicRoutes = results.filter(r => r.system === 'PUBLIC');
    
    console.log(`\n🚀 Sistema Novo (${newSystemRoutes.length} rotas):`);
    const newRegistered = newSystemRoutes.filter(r => r.registered).length;
    console.log(`  Registradas: ${newRegistered}/${newSystemRoutes.length}`);
    console.log(`  Com Auth: ${newSystemRoutes.filter(r => r.needsAuth).length}`);
    
    console.log(`\n🔧 Sistema Antigo (${oldSystemRoutes.length} rotas):`);
    const oldRegistered = oldSystemRoutes.filter(r => r.registered).length;
    console.log(`  Registradas: ${oldRegistered}/${oldSystemRoutes.length}`);
    console.log(`  Com Auth: ${oldSystemRoutes.filter(r => r.needsAuth).length}`);
    
    console.log(`\n🌐 Rotas Públicas (${publicRoutes.length} rotas):`);
    const publicWorking = publicRoutes.filter(r => r.isPublic).length;
    console.log(`  Funcionando: ${publicWorking}/${publicRoutes.length}`);
    
    // Validação final
    const newSystemReady = newRegistered === newSystemRoutes.length;
    const oldSystemPresent = oldRegistered > 0;
    const serverWorking = publicWorking === publicRoutes.length;
    
    console.log('\n🎯 RESULTADO FINAL');
    console.log('=' .repeat(50));
    console.log(`✅ Servidor funcionando: ${serverWorking ? 'SIM' : 'NÃO'}`);
    console.log(`🚀 Sistema novo pronto: ${newSystemReady ? 'SIM' : 'NÃO'}`);
    console.log(`🔧 Sistema antigo presente: ${oldSystemPresent ? 'SIM' : 'NÃO'}`);
    console.log(`⚡ Funcionamento paralelo: ${newSystemReady && oldSystemPresent ? 'SIM' : 'NÃO'}`);
    
    if (newSystemReady && serverWorking) {
        console.log('\n🎉 VALIDAÇÃO APROVADA!');
        console.log('O sistema novo está registrado e funcionando corretamente.');
        console.log('Pronto para continuar com a Fase 3.');
    } else {
        console.log('\n⚠️ VALIDAÇÃO REQUER ATENÇÃO');
        console.log('Verifique os erros antes de prosseguir.');
    }
    
    return {
        newSystemReady,
        oldSystemPresent,
        serverWorking,
        parallelWorking: newSystemReady && oldSystemPresent
    };
}

// Executar se chamado diretamente
if (require.main === module) {
    validateRoutes().catch(console.error);
}

module.exports = { validateRoutes };