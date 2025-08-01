/**
 * FASE 4 - VALIDAÇÃO FINAL: TESTE DE VERIFICAÇÃO DE SAÚDE
 * 
 * Este script testa extensivamente o sistema de verificação de saúde (service-monitor.js).
 * Valida precisão, desempenho e confiabilidade das verificações.
 */

const axios = require('axios');

class ValidadorVerificacaoSaude {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.resultados = {
            testes: [],
            sucesso: 0,
            falhas: 0,
            tempo_total: 0,
            metricas_performance: {
                tempo_resposta_medio: 0,
                tempo_resposta_max: 0,
                requisicoes_por_segundo: 0
            }
        };
        this.instanciasTestadas = [];
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

    async obterInstanciasAtivas() {
        this.log('🔍 Descobrindo instâncias ativas...');
        
        try {
            const response = await axios.get(`${this.baseURL}/api/instances`);
            
            if (response.data.success && response.data.instances) {
                const instanceIds = Object.keys(response.data.instances);
                this.instanciasTestadas = instanceIds;
                this.log(`✅ Encontradas ${instanceIds.length} instâncias para testar`, 'SUCCESS');
                return instanceIds;
            } else {
                this.log('❌ Nenhuma instância encontrada', 'ERROR');
                return [];
            }
        } catch (error) {
            this.log(`❌ Erro ao obter instâncias: ${error.message}`, 'ERROR');
            return [];
        }
    }

    async testeVerificacaoIndividual(instanceId) {
        this.log(`🔍 Testando verificação individual: ${instanceId}`);
        
        try {
            const startTime = Date.now();
            const response = await axios.get(`${this.baseURL}/api/instances/${instanceId}/health`);
            const endTime = Date.now();
            const tempoResposta = endTime - startTime;

            if (!response.data.success) {
                this.log(`❌ API retornou falha para ${instanceId}`, 'ERROR');
                return false;
            }

            const health = response.data.health;
            
            // Validar estrutura da resposta
            if (!health || !health.health || typeof health.health.score !== 'number') {
                this.log(`❌ Estrutura de resposta inválida para ${instanceId}`, 'ERROR');
                return false;
            }

            const score = health.health.score;
            const status = health.health.status;
            
            this.log(`   📊 Score: ${score}% | Status: ${status} | Tempo: ${tempoResposta}ms`, 'INFO');
            
            // Validar consistência dos dados
            if (score < 0 || score > 100) {
                this.log(`❌ Score inválido: ${score}`, 'ERROR');
                return false;
            }

            // Verificar se componentes estão sendo reportados
            if (!health.containers || !health.endpoints) {
                this.log(`❌ Componentes não reportados para ${instanceId}`, 'ERROR');
                return false;
            }

            this.log(`✅ Verificação de ${instanceId} válida`, 'SUCCESS');
            return { success: true, tempoResposta, score, status };

        } catch (error) {
            this.log(`❌ Erro na verificação de ${instanceId}: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testeVerificacaoGlobal() {
        this.log('🌐 Testando verificação global de saúde...');
        
        try {
            const startTime = Date.now();
            const response = await axios.get(`${this.baseURL}/api/instances/health-summary`);
            const endTime = Date.now();
            const tempoResposta = endTime - startTime;

            if (!response.data.success) {
                this.log('❌ API de resumo global falhou', 'ERROR');
                return false;
            }

            const instances = response.data.instances;
            
            if (!instances || typeof instances !== 'object') {
                this.log('❌ Resposta global inválida', 'ERROR');
                return false;
            }

            const numInstancias = Object.keys(instances).length;
            this.log(`✅ Resumo global: ${numInstancias} instâncias em ${tempoResposta}ms`, 'SUCCESS');

            // Validar cada instância no resumo
            let instanciasValidas = 0;
            let scoreMedio = 0;

            for (const [instanceId, health] of Object.entries(instances)) {
                if (health.health && typeof health.health.score === 'number') {
                    instanciasValidas++;
                    scoreMedio += health.health.score;
                    this.log(`   ${instanceId}: ${health.health.score}%`, 'INFO');
                } else {
                    this.log(`   ❌ ${instanceId}: dados inválidos`, 'ERROR');
                }
            }

            scoreMedio = Math.round(scoreMedio / instanciasValidas);
            this.log(`📊 Score médio do sistema: ${scoreMedio}%`, 'INFO');

            return {
                success: true,
                tempoResposta,
                numInstancias,
                instanciasValidas,
                scoreMedio
            };

        } catch (error) {
            this.log(`❌ Erro na verificação global: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testePerformanceCargas() {
        this.log('⚡ Testando performance sob carga...');
        
        if (this.instanciasTestadas.length === 0) {
            this.log('⚠️ Nenhuma instância para teste de carga', 'WARN');
            return false;
        }

        const numRequisicoes = 20;
        const instanceId = this.instanciasTestadas[0];
        const temposResposta = [];

        this.log(`🚀 Fazendo ${numRequisicoes} requisições para ${instanceId}...`);

        const inicioTeste = Date.now();

        // Fazer múltiplas requisições simultâneas
        const promises = [];
        for (let i = 0; i < numRequisicoes; i++) {
            promises.push(this.fazerRequisicaoComTempo(instanceId));
        }

        try {
            const resultados = await Promise.all(promises);
            const fimTeste = Date.now();
            const tempoTotal = fimTeste - inicioTeste;

            // Filtrar sucessos e calcular estatísticas
            const sucessos = resultados.filter(r => r.success);
            const tempos = sucessos.map(r => r.tempo);

            if (tempos.length === 0) {
                this.log('❌ Nenhuma requisição bem-sucedida no teste de carga', 'ERROR');
                return false;
            }

            const tempoMedio = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
            const tempoMax = Math.max(...tempos);
            const reqPorSegundo = Math.round((sucessos.length / tempoTotal) * 1000);

            this.resultados.metricas_performance = {
                tempo_resposta_medio: tempoMedio,
                tempo_resposta_max: tempoMax,
                requisicoes_por_segundo: reqPorSegundo
            };

            this.log(`📊 Performance - Média: ${tempoMedio}ms | Máx: ${tempoMax}ms | RPS: ${reqPorSegundo}`, 'SUCCESS');
            
            // Critérios de aprovação
            if (tempoMedio > 5000) {
                this.log('⚠️ Tempo médio muito alto (> 5s)', 'WARN');
            }
            
            if (sucessos.length < numRequisicoes * 0.9) {
                this.log('❌ Taxa de sucesso baixa na carga', 'ERROR');
                return false;
            }

            this.log('✅ Teste de performance aprovado', 'SUCCESS');
            return true;

        } catch (error) {
            this.log(`❌ Erro no teste de performance: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async fazerRequisicaoComTempo(instanceId) {
        const inicio = Date.now();
        try {
            const response = await axios.get(`${this.baseURL}/api/instances/${instanceId}/health`);
            const fim = Date.now();
            return {
                success: response.data.success,
                tempo: fim - inicio,
                score: response.data.health?.health?.score
            };
        } catch (error) {
            return {
                success: false,
                tempo: Date.now() - inicio,
                error: error.message
            };
        }
    }

    async testeConsistenciaCache() {
        this.log('🗄️ Testando consistência do cache...');
        
        if (this.instanciasTestadas.length === 0) {
            this.log('⚠️ Nenhuma instância para teste de cache', 'WARN');
            return false;
        }

        const instanceId = this.instanciasTestadas[0];
        
        try {
            // Primeira requisição (povoar cache)
            const primeira = await axios.get(`${this.baseURL}/api/instances/${instanceId}/health`);
            const scorePrimeira = primeira.data.health?.health?.score;

            // Aguardar um pouco
            await this.sleep(1000);

            // Segunda requisição (do cache)
            const segunda = await axios.get(`${this.baseURL}/api/instances/${instanceId}/health`);
            const scoreSegunda = segunda.data.health?.health?.score;

            // Aguardar mais tempo para cache expirar
            await this.sleep(3000);

            // Terceira requisição (cache renovado)
            const terceira = await axios.get(`${this.baseURL}/api/instances/${instanceId}/health`);
            const scoreTerceira = terceira.data.health?.health?.score;

            this.log(`📊 Scores: 1ª=${scorePrimeira}% | 2ª=${scoreSegunda}% | 3ª=${scoreTerceira}%`, 'INFO');

            // Cache deve ser consistente mas pode variar ligeiramente
            const variacao = Math.abs(scorePrimeira - scoreTerceira);
            
            if (variacao > 20) {
                this.log('⚠️ Variação alta entre verificações (possível instabilidade)', 'WARN');
            } else {
                this.log('✅ Consistência de cache aprovada', 'SUCCESS');
            }

            return true;

        } catch (error) {
            this.log(`❌ Erro no teste de cache: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async executarTodosOsTestes() {
        const inicioTeste = Date.now();
        this.log('🎯 INICIANDO VALIDAÇÃO DE VERIFICAÇÃO DE SAÚDE - FASE 4');
        this.log('='.repeat(60));

        // Descobrir instâncias
        const instancias = await this.obterInstanciasAtivas();
        if (instancias.length === 0) {
            this.log('❌ Não é possível executar testes sem instâncias', 'ERROR');
            return this.resultados;
        }

        const testes = [
            { nome: 'Verificações Individuais', funcao: () => this.testeTodasVerificacoesIndividuais() },
            { nome: 'Verificação Global', funcao: () => this.testeVerificacaoGlobal() },
            { nome: 'Performance sob Carga', funcao: () => this.testePerformanceCargas() },
            { nome: 'Consistência do Cache', funcao: () => this.testeConsistenciaCache() }
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

    async testeTodasVerificacoesIndividuais() {
        let sucessos = 0;
        let totalTempo = 0;

        for (const instanceId of this.instanciasTestadas) {
            const resultado = await this.testeVerificacaoIndividual(instanceId);
            
            if (resultado && resultado.success) {
                sucessos++;
                totalTempo += resultado.tempoResposta;
            }
        }

        const tempoMedio = Math.round(totalTempo / sucessos);
        this.log(`📊 Verificações individuais: ${sucessos}/${this.instanciasTestadas.length} | Tempo médio: ${tempoMedio}ms`, 'INFO');

        return sucessos >= this.instanciasTestadas.length * 0.8; // 80% sucesso mínimo
    }

    gerarRelatorioFinal() {
        this.log('\n' + '='.repeat(60));
        this.log('📊 RELATÓRIO FINAL - VALIDAÇÃO DE VERIFICAÇÃO DE SAÚDE');
        this.log('='.repeat(60));
        
        this.log(`🏥 Instâncias testadas: ${this.instanciasTestadas.length}`);
        this.log(`✅ Testes bem-sucedidos: ${this.resultados.sucesso}`);
        this.log(`❌ Testes com falha: ${this.resultados.falhas}`);
        this.log(`⏱️ Tempo total: ${Math.round(this.resultados.tempo_total / 1000)}s`);
        
        const perf = this.resultados.metricas_performance;
        if (perf.tempo_resposta_medio > 0) {
            this.log(`⚡ Performance - Média: ${perf.tempo_resposta_medio}ms | Máx: ${perf.tempo_resposta_max}ms | RPS: ${perf.requisicoes_por_segundo}`);
        }
        
        const percentualSucesso = Math.round(
            (this.resultados.sucesso / (this.resultados.sucesso + this.resultados.falhas)) * 100
        );
        
        this.log(`📈 Taxa de sucesso: ${percentualSucesso}%`);
        
        if (percentualSucesso >= 80) {
            this.log('🎉 VALIDAÇÃO APROVADA - Sistema de saúde funcionando corretamente', 'SUCCESS');
        } else {
            this.log('⚠️ VALIDAÇÃO REPROVADA - Revisar sistema de saúde', 'ERROR');
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Executar validação se chamado diretamente
if (require.main === module) {
    const validador = new ValidadorVerificacaoSaude();
    validador.executarTodosOsTestes()
        .then(resultados => {
            process.exit(resultados.falhas > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Erro fatal na validação:', error);
            process.exit(1);
        });
}

module.exports = ValidadorVerificacaoSaude;