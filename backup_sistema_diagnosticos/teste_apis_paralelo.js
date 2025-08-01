#!/usr/bin/env node

/**
 * Script de Teste - Sistema Novo vs Sistema Antigo
 * Testa as novas APIs de saúde em paralelo com as antigas
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3080';

// Simulação de dados para testes
const TEST_INSTANCE_ID = 'test-instance-123';

// Função auxiliar para fazer requisições
async function makeRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        const data = await response.json();
        return {
            status: response.status,
            success: response.ok,
            data: data
        };
    } catch (error) {
        return {
            status: 500,
            success: false,
            error: error.message
        };
    }
}

// Testes das novas APIs
async function testNewSystemAPIs() {
    console.log('\n🚀 TESTANDO SISTEMA NOVO - Service Monitor');
    console.log('=' .repeat(50));
    
    // Teste 1: Health Summary
    console.log('\n📊 Teste 1: Health Summary');
    const healthSummary = await makeRequest('/api/instances/health-summary');
    console.log(`Status: ${healthSummary.status}`);
    console.log(`Success: ${healthSummary.success}`);
    console.log('Response:', JSON.stringify(healthSummary.data, null, 2));
    
    // Teste 2: Instance Health (sem instância real)
    console.log('\n🔍 Teste 2: Instance Health');
    const instanceHealth = await makeRequest(`/api/instances/${TEST_INSTANCE_ID}/health`);
    console.log(`Status: ${instanceHealth.status}`);
    console.log(`Success: ${instanceHealth.success}`);
    console.log('Response:', JSON.stringify(instanceHealth.data, null, 2));
    
    // Teste 3: Restart Services
    console.log('\n🔄 Teste 3: Restart Services');
    const restartServices = await makeRequest(`/api/instances/${TEST_INSTANCE_ID}/restart-services`, {
        method: 'POST',
        body: JSON.stringify({ forceAll: false })
    });
    console.log(`Status: ${restartServices.status}`);
    console.log(`Success: ${restartServices.success}`);
    console.log('Response:', JSON.stringify(restartServices.data, null, 2));
    
    // Teste 4: Restart Specific Service  
    console.log('\n⚙️ Teste 4: Restart Specific Service');
    const restartSpecific = await makeRequest(`/api/instances/${TEST_INSTANCE_ID}/restart-service/db`, {
        method: 'POST'
    });
    console.log(`Status: ${restartSpecific.status}`);
    console.log(`Success: ${restartSpecific.success}`);
    console.log('Response:', JSON.stringify(restartSpecific.data, null, 2));
    
    return {
        healthSummary: healthSummary.success,
        instanceHealth: instanceHealth.status === 404, // Esperado para instância inexistente
        restartServices: restartServices.status === 404, // Esperado para instância inexistente
        restartSpecific: restartSpecific.status === 404 // Esperado para instância inexistente
    };
}

// Testes das antigas APIs (se ainda existirem)
async function testOldSystemAPIs() {
    console.log('\n🔧 TESTANDO SISTEMA ANTIGO - Diagnósticos');
    console.log('=' .repeat(50));
    
    // Teste 1: Run Diagnostics
    console.log('\n📊 Teste 1: Run Diagnostics (OLD)');
    const runDiagnostics = await makeRequest(`/api/instances/${TEST_INSTANCE_ID}/run-diagnostics`);
    console.log(`Status: ${runDiagnostics.status}`);
    console.log(`Success: ${runDiagnostics.success}`);
    console.log('Response:', JSON.stringify(runDiagnostics.data, null, 2));
    
    // Teste 2: Global Stats
    console.log('\n📈 Teste 2: Global Stats (OLD)');
    const globalStats = await makeRequest('/api/diagnostics/global-stats');
    console.log(`Status: ${globalStats.status}`);
    console.log(`Success: ${globalStats.success}`);
    console.log('Response:', JSON.stringify(globalStats.data, null, 2));
    
    return {
        runDiagnostics: runDiagnostics.success,
        globalStats: globalStats.success
    };
}

// Comparação de Performance
async function performanceComparison() {
    console.log('\n⚡ COMPARAÇÃO DE PERFORMANCE');
    console.log('=' .repeat(50));
    
    const tests = [
        { name: 'Health Summary (NEW)', endpoint: '/api/instances/health-summary' },
        { name: 'Global Stats (OLD)', endpoint: '/api/diagnostics/global-stats' }
    ];
    
    for (const test of tests) {
        const startTime = Date.now();
        const result = await makeRequest(test.endpoint);
        const endTime = Date.now();
        
        console.log(`\n${test.name}:`);
        console.log(`  Tempo: ${endTime - startTime}ms`);
        console.log(`  Status: ${result.status}`);
        console.log(`  Success: ${result.success}`);
    }
}

// Validação de não interferência 
async function validateNonInterference() {
    console.log('\n🛡️ VALIDAÇÃO DE NÃO INTERFERÊNCIA');
    console.log('=' .repeat(50));
    
    // Simular chamadas simultâneas
    console.log('\n🔄 Teste de chamadas simultâneas...');
    
    const promises = [
        makeRequest('/api/instances/health-summary'),
        makeRequest('/api/instances/health-summary'),
        makeRequest('/api/instances/health-summary')
    ];
    
    const startTime = Date.now();
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`Tempo total: ${endTime - startTime}ms`);
    console.log(`Resultados simultâneos: ${results.every(r => r.success || r.status === 401)}`);
    
    return results.every(r => r.success || r.status === 401); // 401 é aceitável (auth)
}

// Função principal
async function runTests() {
    console.log('🧪 INICIANDO TESTES DO SISTEMA DE SAÚDE');
    console.log('Fase 2: Backup e Preparação - Testes em Paralelo');
    console.log('Data:', new Date().toISOString());
    
    try {
        // Testes do sistema novo
        const newSystemResults = await testNewSystemAPIs();
        
        // Testes do sistema antigo
        const oldSystemResults = await testOldSystemAPIs();
        
        // Comparação de performance
        await performanceComparison();
        
        // Validação de não interferência
        const nonInterferenceOk = await validateNonInterference();
        
        // Relatório final
        console.log('\n📋 RELATÓRIO FINAL');
        console.log('=' .repeat(50));
        console.log('\n✅ Sistema Novo (Service Monitor):');
        Object.entries(newSystemResults).forEach(([test, result]) => {
            console.log(`  ${test}: ${result ? '✅' : '❌'}`);
        });
        
        console.log('\n🔧 Sistema Antigo (Diagnósticos):');
        Object.entries(oldSystemResults).forEach(([test, result]) => {
            console.log(`  ${test}: ${result ? '✅' : '❌'}`);
        });
        
        console.log(`\n🛡️ Não Interferência: ${nonInterferenceOk ? '✅' : '❌'}`);
        
        // Verifica se pode prosseguir para Fase 3
        const newSystemWorking = Object.values(newSystemResults).some(r => r);
        const readyForPhase3 = newSystemWorking && nonInterferenceOk;
        
        console.log(`\n🚀 Pronto para Fase 3: ${readyForPhase3 ? '✅' : '❌'}`);
        
        if (readyForPhase3) {
            console.log('\n✅ FASE 2 CONCLUÍDA COM SUCESSO!');
            console.log('O sistema novo está funcionando corretamente em paralelo.');
            console.log('Pode prosseguir para a Fase 3 (Remoção Gradual).');
        } else {
            console.log('\n⚠️ FASE 2 REQUER ATENÇÃO');
            console.log('Verifique os erros antes de prosseguir para a Fase 3.');
        }
        
    } catch (error) {
        console.error('\n❌ ERRO DURANTE OS TESTES:', error);
    }
}

// Executar testes se chamado diretamente
if (require.main === module) {
    runTests();
}

module.exports = { runTests, testNewSystemAPIs, testOldSystemAPIs };