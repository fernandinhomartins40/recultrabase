/**
 * FASE 4 - VALIDAÇÃO FINAL: TESTE DE NÃO INTERFERÊNCIA
 * 
 * Este script valida que o novo sistema de monitoramento não interfere
 * com as operações principais do sistema (criação, gerenciamento, APIs críticas).
 */

const axios = require('axios');

class ValidadorNaoInterferencia {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.resultados = {
            testes: [],
            sucesso: 0,
            falhas: 0,
            tempo_total: 0,
            operacoes_criticas: {
                apis_principais_ok: 0,
                tempo_resposta_impacto: 0,
                recursos_sistema_ok: true
            }
        };
        this.instanciaOriginal = null;
        this.apisEssenciais = [
            { endpoint: '/api/instances', metodo: 'GET', nome: 'Listar Instâncias' },
            { endpoint: '/api/instances', metodo: 'POST', nome: 'Criar Instância' },
            { endpoint: '/api/docker/info', metodo: 'GET', nome: 'Info Docker' },
            { endpoint: '/api/system/status', metodo: 'GET', nome: 'Status Sistema' }
        ];
    }

    log(message, tipo = 'INFO') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${tipo}] ${message}`);
        
        this.resultados.testes.push({
            timestamp,
            tipo,
            message,
            success: tipo !== 'ERROR'
        });
    }

    async testeAPIsEssenciaisDisponibilidade() {
        this.log('🔍 Testando disponibilidade das APIs essenciais...');
        
        let apisOk = 0;
        const temposResposta = [];

        for (const api of this.apisEssenciais) {
            try {
                const inicio = Date.now();
                let response;

                if (api.metodo === 'GET') {
                    response = await axios.get(`${this.baseURL}${api.endpoint}`);
                } else if (api.metodo === 'POST' && api.endpoint === '/api/instances') {
                    // Teste especial para criação - não criar realmente
                    continue; // Pular criação no teste de disponibilidade
                }

                const tempo = Date.now() - inicio;
                temposResposta.push(tempo);

                if (response.status === 200 || response.status === 201) {
                    this.log(`   ✅ ${api.nome}: OK (${tempo}ms)`, 'SUCCESS');
                    apisOk++;
                } else {
                    this.log(`   ⚠️ ${api.nome}: Status ${response.status}`, 'WARN');
                }

            } catch (error) {
                this.log(`   ❌ ${api.nome}: ${error.message}`, 'ERROR');
            }
        }

        const tempoMedio = temposResposta.length > 0 ? 
            Math.round(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length) : 0;

        this.resultados.operacoes_criticas.apis_principais_ok = apisOk;
        this.resultados.operacoes_criticas.tempo_resposta_impacto = tempoMedio;

        this.log(`📊 APIs essenciais: ${apisOk}/${this.apisEssenciais.length - 1} OK | Tempo médio: ${tempoMedio}ms`, 'INFO');

        return apisOk >= (this.apisEssenciais.length - 1) * 0.8; // 80% das APIs devem funcionar
    }

    async testeImpactoPerformanceAPIs() {
        this.log('⚡ Testando impacto na performance das APIs principais...');
        
        const numRequisicoes = 10;
        const temposAntes = [];
        const temposDepois = [];

        // Medir performance ANTES de usar o sistema de saúde
        this.log('   📊 Medindo performance baseline...');
        for (let i = 0; i < numRequisicoes; i++) {
            try {
                const inicio = Date.now();
                await axios.get(`${this.baseURL}/api/instances`);
                temposAntes.push(Date.now() - inicio);
                await this.sleep(200); // Pequena pausa entre requisições
            } catch (error) {
                this.log(`   ⚠️ Erro na medição baseline: ${error.message}`, 'WARN');
            }
        }

        // Usar sistema de saúde intensivamente
        this.log('   🔄 Executando verificações de saúde simultâneas...');
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(axios.get(`${this.baseURL}/api/instances/health-summary`));
        }
        await Promise.allSettled(promises);

        // Medir performance DEPOIS de usar o sistema de saúde
        this.log('   📊 Medindo performance após uso do sistema de saúde...');
        for (let i = 0; i < numRequisicoes; i++) {
            try {
                const inicio = Date.now();
                await axios.get(`${this.baseURL}/api/instances`);
                temposDepois.push(Date.now() - inicio);
                await this.sleep(200);
            } catch (error) {
                this.log(`   ⚠️ Erro na medição pós-uso: ${error.message}`, 'WARN');
            }
        }

        if (temposAntes.length === 0 || temposDepois.length === 0) {
            this.log('❌ Não foi possível medir impacto na performance', 'ERROR');
            return false;
        }

        const mediaAntes = temposAntes.reduce((a, b) => a + b, 0) / temposAntes.length;
        const mediaDepois = temposDepois.reduce((a, b) => a + b, 0) / temposDepois.length;
        const impacto = ((mediaDepois - mediaAntes) / mediaAntes) * 100;

        this.log(`   📊 Performance - Antes: ${Math.round(mediaAntes)}ms | Depois: ${Math.round(mediaDepois)}ms`, 'INFO');
        this.log(`   📈 Impacto: ${impacto > 0 ? '+' : ''}${Math.round(impacto)}%`, impacto < 20 ? 'SUCCESS' : 'WARN');

        // Aceitar até 20% de impacto na performance
        if (impacto < 20) {
            this.log('✅ Impacto na performance aceitável', 'SUCCESS');
            return true;
        } else {
            this.log('⚠️ Impacto na performance elevado', 'WARN');
            return false;
        }
    }

    async testeIsolamentoOperacoes() {
        this.log('🔒 Testando isolamento das operações de saúde...');
        
        try {
            // Obter instâncias existentes
            const instancesResponse = await axios.get(`${this.baseURL}/api/instances`);
            if (!instancesResponse.data.success || !instancesResponse.data.instances) {
                this.log('❌ Não foi possível obter instâncias para teste de isolamento', 'ERROR');
                return false;
            }

            const instanceIds = Object.keys(instancesResponse.data.instances);
            if (instanceIds.length === 0) {
                this.log('⚠️ Nenhuma instância disponível para teste de isolamento', 'WARN');
                return true; // Não há instâncias para testar, consideramos OK
            }

            // Testar múltiplas operações simultâneas
            this.log('   🚀 Executando operações simultâneas...');
            
            const operacoesSimultaneas = [
                // Operações do sistema principal
                axios.get(`${this.baseURL}/api/instances`),
                axios.get(`${this.baseURL}/api/docker/info`),
                
                // Operações do sistema de saúde
                axios.get(`${this.baseURL}/api/instances/health-summary`),
                axios.get(`${this.baseURL}/api/instances/${instanceIds[0]}/health`)
            ];

            const inicioSimultaneo = Date.now();
            const resultados = await Promise.allSettled(operacoesSimultaneas);
            const tempoTotal = Date.now() - inicioSimultaneo;

            let sucessos = 0;
            let falhas = 0;

            resultados.forEach((resultado, index) => {
                const nomes = ['Listar Instâncias', 'Info Docker', 'Resumo Saúde', 'Saúde Individual'];
                
                if (resultado.status === 'fulfilled' && resultado.value.status === 200) {
                    this.log(`     ✅ ${nomes[index]}: OK`, 'SUCCESS');
                    sucessos++;
                } else {
                    this.log(`     ❌ ${nomes[index]}: Falha`, 'ERROR');
                    falhas++;
                }
            });

            this.log(`   📊 Operações simultâneas: ${sucessos}/${operacoesSimultaneas.length} OK em ${tempoTotal}ms`, 'INFO');

            // Verificar se houve bloqueios ou interferências
            if (sucessos >= operacoesSimultaneas.length * 0.8) {
                this.log('✅ Isolamento de operações validado', 'SUCCESS');
                return true;
            } else {
                this.log('❌ Possível interferência entre operações detectada', 'ERROR');
                return false;
            }

        } catch (error) {
            this.log(`❌ Erro no teste de isolamento: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testeRecursosDoSistema() {
        this.log('💻 Testando uso de recursos do sistema...');
        
        try {
            // Tentar obter informações do sistema (se disponível)
            const statusResponse = await axios.get(`${this.baseURL}/api/system/status`).catch(() => null);
            
            if (statusResponse && statusResponse.data) {
                this.log('   📊 Status do sistema obtido', 'SUCCESS');
                
                // Se há informações de memória/CPU disponíveis, verificar
                if (statusResponse.data.memory || statusResponse.data.cpu) {
                    this.log('   💾 Recursos monitorados pelo sistema', 'INFO');
                }
            }

            // Executar operações intensivas do sistema de saúde para verificar impacto
            this.log('   🔄 Executando operações intensivas de saúde...');
            
            const operacoesIntensivas = [];
            for (let i = 0; i < 20; i++) {
                operacoesIntensivas.push(
                    axios.get(`${this.baseURL}/api/instances/health-summary`)
                );
            }

            const inicioIntensivo = Date.now();
            await Promise.allSettled(operacoesIntensivas);
            const tempoIntensivo = Date.now() - inicioIntensivo;

            this.log(`   ⏱️ 20 operações de saúde executadas em ${tempoIntensivo}ms`, 'INFO');

            // Verificar se sistema principal ainda responde após uso intensivo
            const testeResposta = await axios.get(`${this.baseURL}/api/instances`);
            
            if (testeResposta.status === 200) {
                this.log('✅ Sistema principal responsivo após uso intensivo', 'SUCCESS');
                this.resultados.operacoes_criticas.recursos_sistema_ok = true;
                return true;
            } else {
                this.log('❌ Sistema principal com problemas após uso intensivo', 'ERROR');
                this.resultados.operacoes_criticas.recursos_sistema_ok = false;
                return false;
            }

        } catch (error) {
            this.log(`❌ Erro no teste de recursos: ${error.message}`, 'ERROR');
            this.resultados.operacoes_criticas.recursos_sistema_ok = false;
            return false;
        }
    }

    async testeConsistenciaEstadoInstancias() {
        this.log('🔄 Testando consistência do estado das instâncias...');
        
        try {
            // Obter estado das instâncias via API principal
            const instancesResponse = await axios.get(`${this.baseURL}/api/instances`);
            if (!instancesResponse.data.success) {
                this.log('❌ Não foi possível obter instâncias via API principal', 'ERROR');
                return false;
            }

            const instancesPrincipal = instancesResponse.data.instances || {};
            const instanceIdsPrincipal = Object.keys(instancesPrincipal);

            // Obter estado via sistema de saúde
            const healthResponse = await axios.get(`${this.baseURL}/api/instances/health-summary`);
            if (!healthResponse.data.success) {
                this.log('❌ Não foi possível obter resumo de saúde', 'ERROR');
                return false;
            }

            const instancesHealth = healthResponse.data.instances || {};
            const instanceIdsHealth = Object.keys(instancesHealth);

            // Comparar consistência
            const instanciasComuns = instanceIdsPrincipal.filter(id => instanceIdsHealth.includes(id));
            const instanciasApenasPrincipal = instanceIdsPrincipal.filter(id => !instanceIdsHealth.includes(id));
            const instanciasApenasHealth = instanceIdsHealth.filter(id => !instanceIdsPrincipal.includes(id));

            this.log(`   📊 Instâncias comuns: ${instanciasComuns.length}`, 'INFO');
            this.log(`   📊 Apenas no principal: ${instanciasApenasPrincipal.length}`, instanciasApenasPrincipal.length > 0 ? 'WARN' : 'INFO');
            this.log(`   📊 Apenas no health: ${instanciasApenasHealth.length}`, instanciasApenasHealth.length > 0 ? 'WARN' : 'INFO');

            // Verificar detalhes das instâncias comuns
            let consistenciaOk = 0;
            for (const instanceId of instanciasComuns.slice(0, 3)) { // Testar max 3 instâncias
                const instanciaPrincipal = instancesPrincipal[instanceId];
                const instanciaHealth = instancesHealth[instanceId];

                if (instanciaPrincipal && instanciaHealth) {
                    // Verificar se as informações básicas coincidem
                    const nomeCoincide = instanciaPrincipal.project_name && 
                                        instanciaHealth.instanceId === instanceId;
                    
                    if (nomeCoincide) {
                        this.log(`     ✅ ${instanceId}: Consistência OK`, 'SUCCESS');
                        consistenciaOk++;
                    } else {
                        this.log(`     ⚠️ ${instanceId}: Possível inconsistência`, 'WARN');
                    }
                }
            }

            const percentualConsistencia = instanciasComuns.length > 0 ? 
                (consistenciaOk / Math.min(instanciasComuns.length, 3)) * 100 : 100;

            this.log(`📊 Consistência: ${Math.round(percentualConsistencia)}%`, 'INFO');

            if (percentualConsistencia >= 80) {
                this.log('✅ Consistência do estado das instâncias validada', 'SUCCESS');
                return true;
            } else {
                this.log('⚠️ Possível inconsistência no estado das instâncias', 'WARN');
                return false;
            }

        } catch (error) {
            this.log(`❌ Erro no teste de consistência: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async executarTodosOsTestes() {
        const inicioTeste = Date.now();
        this.log('🎯 INICIANDO VALIDAÇÃO DE NÃO INTERFERÊNCIA - FASE 4');
        this.log('='.repeat(60));

        const testes = [
            { nome: 'Disponibilidade de APIs Essenciais', funcao: () => this.testeAPIsEssenciaisDisponibilidade() },
            { nome: 'Impacto na Performance', funcao: () => this.testeImpactoPerformanceAPIs() },
            { nome: 'Isolamento de Operações', funcao: () => this.testeIsolamentoOperacoes() },
            { nome: 'Recursos do Sistema', funcao: () => this.testeRecursosDoSistema() },
            { nome: 'Consistência do Estado', funcao: () => this.testeConsistenciaEstadoInstancias() }
        ];

        for (const teste of testes) {
            this.log(`\n📋 Executando: ${teste.nome}...`);
            const resultado = await teste.funcao();
            
            if (resultado) {
                this.resultados.sucesso++;
                this.log(`✅ ${teste.nome}: PASSOU`, 'SUCCESS');
            } else {
                this.resultados.falhas++;
                this.log(`❌ ${teste.nome}: FALHOU`, 'ERROR');
            }
        }

        this.resultados.tempo_total = Date.now() - inicioTeste;
        this.gerarRelatorioFinal();
        return this.resultados;
    }

    gerarRelatorioFinal() {
        this.log('\n' + '='.repeat(60));
        this.log('📊 RELATÓRIO FINAL - VALIDAÇÃO DE NÃO INTERFERÊNCIA');
        this.log('='.repeat(60));
        
        this.log(`✅ Testes bem-sucedidos: ${this.resultados.sucesso}`);
        this.log(`❌ Testes com falha: ${this.resultados.falhas}`);
        this.log(`⏱️ Tempo total: ${Math.round(this.resultados.tempo_total / 1000)}s`);
        
        const ops = this.resultados.operacoes_criticas;
        this.log(`🔧 APIs principais OK: ${ops.apis_principais_ok}/${this.apisEssenciais.length - 1}`);
        this.log(`⚡ Tempo médio de resposta: ${ops.tempo_resposta_impacto}ms`);
        this.log(`💻 Recursos do sistema: ${ops.recursos_sistema_ok ? 'OK' : 'Problemas'}`);
        
        const percentualSucesso = Math.round(
            (this.resultados.sucesso / (this.resultados.sucesso + this.resultados.falhas)) * 100
        );
        
        this.log(`📈 Taxa de sucesso: ${percentualSucesso}%`);
        
        if (percentualSucesso >= 80) {
            this.log('🎉 VALIDAÇÃO APROVADA - Sistema não interfere com operações principais', 'SUCCESS');
        } else {
            this.log('⚠️ VALIDAÇÃO REPROVADA - Possível interferência detectada', 'ERROR');
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Executar validação se chamado diretamente
if (require.main === module) {
    const validador = new ValidadorNaoInterferencia();
    validador.executarTodosOsTestes()
        .then(resultados => {
            process.exit(resultados.falhas > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Erro fatal na validação:', error);
            process.exit(1);
        });
}

module.exports = ValidadorNaoInterferencia;