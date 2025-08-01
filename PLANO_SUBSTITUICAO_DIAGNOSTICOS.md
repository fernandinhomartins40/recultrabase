# Plano de Substituição do Sistema de Diagnósticos

## 🎯 Objetivo

Substituir o sistema complexo de diagnósticos atual por um sistema mais simples e robusto focado especificamente na **verificação de serviços** e **reinicialização automática**, garantindo que as instâncias funcionem corretamente sem afetar a criação e gerenciamento das mesmas.

## 📊 Análise do Sistema Atual

### **Sistema Atual - Complexidade Excessiva**
```
diagnostics/
├── health-checker.js                    # 500+ linhas
├── diagnostic-actions.js                # 300+ linhas  
├── diagnostic-history.js                # 200+ linhas
├── scheduled-diagnostics.js             # 400+ linhas
├── log-analyzer.js                      # 350+ linhas
├── interfaces/repair-api.js             # 250+ linhas
└── auto-repair/                         # 8 arquivos, 2000+ linhas
    ├── auto-repair-engine.js
    ├── backup-manager.js
    ├── container-fixer.js
    ├── credential-manager.js
    ├── intelligent-analyzer.js
    ├── network-fixer.js
    ├── rollback-manager.js
    └── service-fixer.js

TOTAL: ~4000 linhas de código
APIs: 18 endpoints de diagnóstico
```

### **Problemas Identificados**
1. **Complexidade excessiva** - Sistema com muitos módulos interconectados
2. **Overhead computacional** - Análises profundas de logs e histórico
3. **Manutenção complexa** - Muitos pontos de falha potencial
4. **Funcionalidades redundantes** - Múltiplas camadas fazendo coisas similares
5. **Risk de interferência** - Sistema complexo pode afetar operações principais

## 🚀 Sistema Proposto - Service Monitor

### **Arquitetura Simplificada**
```
services/
├── service-monitor.js          # Monitor principal de serviços (150 linhas)
├── container-manager.js        # Gerenciamento de containers (100 linhas)
└── service-restarter.js        # Reinicialização de serviços (80 linhas)

TOTAL: ~330 linhas de código
APIs: 4 endpoints essenciais
```

### **Funcionalidades Core**

#### **1. Verificação de Serviços (service-monitor.js)**
```javascript
// Verifica apenas o essencial
const serviceChecks = {
  containers: checkContainerStatus,    // Docker containers rodando?
  httpServices: checkHttpEndpoints,    // Kong, Studio, PostgREST respondem?
  database: checkDatabaseConnection,   // PostgreSQL conecta?
  ports: checkPortAvailability        // Portas estão abertas?
};
```

#### **2. Reinicialização Inteligente (service-restarter.js)**
```javascript
// Reinicia serviços com dependências corretas
const restartOrder = [
  'supabase-db-{instanceId}',          // 1. Database primeiro
  'supabase-kong-{instanceId}',        // 2. Gateway
  'supabase-auth-{instanceId}',        // 3. Auth
  'supabase-rest-{instanceId}',        // 4. PostgREST
  'supabase-studio-{instanceId}'       // 5. Studio por último
];
```

## 🔧 Implementação Detalhada

### **Fase 1: Service Monitor Core**

#### **service-monitor.js - Monitor Principal**
```javascript
class ServiceMonitor {
  constructor(dockerHost) {
    this.docker = new Docker({ host: dockerHost });
    this.cache = new Map(); // Cache simples de status
  }

  // Verificação rápida de uma instância
  async checkInstance(instanceId) {
    const checks = {
      containers: await this.checkContainers(instanceId),
      endpoints: await this.checkEndpoints(instanceId),
      database: await this.checkDatabase(instanceId)
    };
    
    const health = this.calculateHealthScore(checks);
    this.cache.set(instanceId, { ...checks, health, timestamp: Date.now() });
    
    return { instanceId, ...checks, health };
  }

  // Verifica containers Docker
  async checkContainers(instanceId) {
    const requiredContainers = [
      `supabase-db-${instanceId}`,
      `supabase-kong-${instanceId}`,
      `supabase-auth-${instanceId}`,
      `supabase-rest-${instanceId}`,
      `supabase-studio-${instanceId}`
    ];

    const results = {};
    for (const containerName of requiredContainers) {
      try {
        const container = this.docker.getContainer(containerName);
        const info = await container.inspect();
        results[containerName] = {
          status: info.State.Status,
          running: info.State.Running,
          healthy: info.State.Running && info.State.Status === 'running'
        };
      } catch (error) {
        results[containerName] = { status: 'not_found', running: false, healthy: false };
      }
    }
    
    return results;
  }

  // Verifica endpoints HTTP
  async checkEndpoints(instanceId, instance) {
    const endpoints = [
      { name: 'studio', url: `http://localhost:${instance.ports.studio}` },
      { name: 'kong', url: `http://localhost:${instance.ports.kong}` },
      { name: 'rest', url: `http://localhost:${instance.ports.kong}/rest/v1/` }
    ];

    const results = {};
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(endpoint.url, {
          signal: controller.signal,
          method: 'HEAD'
        });
        
        clearTimeout(timeoutId);
        results[endpoint.name] = {
          status: response.status,
          healthy: response.status < 500
        };
      } catch (error) {
        results[endpoint.name] = { status: 'error', healthy: false, error: error.message };
      }
    }
    
    return results;
  }

  // Calcula score de saúde simples
  calculateHealthScore(checks) {
    let total = 0;
    let healthy = 0;

    // Containers
    Object.values(checks.containers).forEach(container => {
      total++;
      if (container.healthy) healthy++;
    });

    // Endpoints
    Object.values(checks.endpoints).forEach(endpoint => {
      total++;
      if (endpoint.healthy) healthy++;
    });

    // Database
    total++;
    if (checks.database.healthy) healthy++;

    return {
      score: Math.round((healthy / total) * 100),
      healthy: healthy,
      total: total,
      status: healthy === total ? 'healthy' : healthy > total * 0.5 ? 'degraded' : 'unhealthy'
    };
  }
}
```

#### **service-restarter.js - Reinicialização Inteligente**
```javascript
class ServiceRestarter {
  constructor(docker, serviceMonitor) {
    this.docker = docker;
    this.monitor = serviceMonitor;
  }

  // Reinicia serviços de uma instância
  async restartInstanceServices(instanceId, instance, options = {}) {
    const restartLog = [];
    const restartOrder = [
      'supabase-db',
      'supabase-kong', 
      'supabase-auth',
      'supabase-rest',
      'supabase-studio'
    ];

    // Verificar status antes de reiniciar
    const initialStatus = await this.monitor.checkInstance(instanceId);
    restartLog.push({ step: 'initial_check', status: initialStatus.health });

    for (const serviceName of restartOrder) {
      const containerName = `${serviceName}-${instanceId}`;
      
      try {
        // Só reinicia se necessário ou se forçado
        if (options.forceAll || !initialStatus.containers[containerName]?.healthy) {
          await this.restartContainer(containerName);
          restartLog.push({ step: 'restart', container: containerName, success: true });
          
          // Aguardar 3 segundos entre reinicializações
          await this.sleep(3000);
        } else {
          restartLog.push({ step: 'skip', container: containerName, reason: 'healthy' });
        }
      } catch (error) {
        restartLog.push({ step: 'restart', container: containerName, success: false, error: error.message });
      }
    }

    // Verificar status após reinicialização
    await this.sleep(5000); // Aguardar serviços iniciarem
    const finalStatus = await this.monitor.checkInstance(instanceId);
    restartLog.push({ step: 'final_check', status: finalStatus.health });

    return {
      instanceId,
      success: finalStatus.health.score > initialStatus.health.score,
      initialScore: initialStatus.health.score,
      finalScore: finalStatus.health.score,
      restartLog
    };
  }

  async restartContainer(containerName) {
    const container = this.docker.getContainer(containerName);
    await container.restart({ t: 10 }); // 10 segundos timeout
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### **Fase 2: APIs Simplificadas**

#### **4 Endpoints Essenciais**
```javascript
// 1. Verificar saúde de uma instância
app.get('/api/instances/:id/health', async (req, res) => {
  const instanceId = req.params.id;
  const instance = manager.instances[instanceId];
  
  if (!instance) {
    return res.status(404).json({ error: 'Instância não encontrada' });
  }

  const health = await serviceMonitor.checkInstance(instanceId, instance);
  res.json({ success: true, health });
});

// 2. Reiniciar serviços de uma instância
app.post('/api/instances/:id/restart-services', async (req, res) => {
  const instanceId = req.params.id;
  const instance = manager.instances[instanceId];
  const { forceAll = false } = req.body;
  
  if (!instance) {
    return res.status(404).json({ error: 'Instância não encontrada' });
  }

  const result = await serviceRestarter.restartInstanceServices(instanceId, instance, { forceAll });
  res.json({ success: true, result });
});

// 3. Verificar saúde de todas as instâncias
app.get('/api/instances/health-summary', async (req, res) => {
  const results = {};
  
  for (const [instanceId, instance] of Object.entries(manager.instances)) {
    results[instanceId] = await serviceMonitor.checkInstance(instanceId, instance);
  }
  
  res.json({ success: true, instances: results });
});

// 4. Reiniciar serviço específico
app.post('/api/instances/:id/restart-service/:serviceName', async (req, res) => {
  const { instanceId, serviceName } = req.params;
  const containerName = `supabase-${serviceName}-${instanceId}`;
  
  try {
    await serviceRestarter.restartContainer(containerName);
    
    // Aguardar e verificar se reiniciou
    await serviceRestarter.sleep(3000);
    const health = await serviceMonitor.checkInstance(instanceId);
    
    res.json({ 
      success: true, 
      message: `Serviço ${serviceName} reiniciado`,
      health: health.containers[containerName]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### **Fase 3: Interface Simplificada**

#### **Drawer "Saúde da Instância"**
```html
<div class="health-section">
  <h4><i data-lucide="heart-pulse" class="lucide lucide-sm"></i> Saúde dos Serviços</h4>
  
  <div class="health-overview">
    <div class="health-score">
      <span class="score-number" id="health-score">--</span>
      <span class="score-label">Score de Saúde</span>
    </div>
    <div class="health-status" id="health-status">
      <span class="status-indicator"></span>
      <span class="status-text">Verificando...</span>
    </div>
  </div>

  <div class="services-grid" id="services-status">
    <!-- Será preenchido dinamicamente -->
    <div class="service-item">
      <span class="service-name">Database</span>
      <span class="service-status healthy">✅</span>
    </div>
    <div class="service-item">
      <span class="service-name">Kong Gateway</span>
      <span class="service-status healthy">✅</span>
    </div>
    <!-- ... outros serviços -->
  </div>

  <div class="health-actions">
    <button class="btn btn-primary" onclick="checkInstanceHealth('${config.project_id}')">
      <i data-lucide="refresh-cw" class="lucide lucide-sm"></i>
      Verificar Saúde
    </button>
    <button class="btn btn-warning" onclick="restartServices('${config.project_id}')">
      <i data-lucide="rotate-ccw" class="lucide lucide-sm"></i>
      Reiniciar Serviços
    </button>
  </div>

  <div class="quick-actions">
    <h5>Reiniciar Serviço Específico:</h5>
    <div class="service-buttons">
      <button class="btn btn-sm btn-secondary" onclick="restartService('${config.project_id}', 'db')">Database</button>
      <button class="btn btn-sm btn-secondary" onclick="restartService('${config.project_id}', 'kong')">Kong</button>
      <button class="btn btn-sm btn-secondary" onclick="restartService('${config.project_id}', 'auth')">Auth</button>
      <button class="btn btn-sm btn-secondary" onclick="restartService('${config.project_id}', 'rest')">REST</button>
      <button class="btn btn-sm btn-secondary" onclick="restartService('${config.project_id}', 'studio')">Studio</button>
    </div>
  </div>
</div>
```

## 🗂️ Plano de Migração

### **Fase 1: Implementação do Sistema Novo**
1. ✅ Criar `src/services/service-monitor.js`
2. ✅ Criar `src/services/service-restarter.js`
3. ✅ Implementar APIs básicas no `server.js`
4. ✅ Adicionar interface no drawer
5. ✅ Testes básicos de funcionamento

### **Fase 2: Backup e Preparação**
1. ✅ Criar backup completo do sistema atual
2. ✅ Documentar todas as referências de diagnósticos
3. ✅ Testar sistema novo em paralelo
4. ✅ Validar que não afeta criação de instâncias

### **Fase 3: Remoção Gradual**
1. ✅ Remover imports de diagnósticos do `server.js`
2. ✅ Remover APIs de diagnósticos antigas
3. ✅ Remover pasta `diagnostics/` completa
4. ✅ Limpar referências no código
5. ✅ Atualizar drawer com nova interface

### **Fase 4: Validação Final**
1. ✅ Testes completos de criação de instâncias
2. ✅ Testes de verificação de saúde
3. ✅ Testes de reinicialização de serviços
4. ✅ Validação de não interferência no sistema principal

## ⚠️ Cuidados de Segurança

### **Isolamento Garantido**
1. **Namespace separado**: Todas as operações em `src/services/`
2. **APIs isoladas**: Endpoints específicos sem afetar criação
3. **Cache simples**: Sem persistência complexa que possa travar
4. **Timeouts configurados**: Evitar operações que travem o sistema
5. **Tratamento de erro robusto**: Falhas não afetam operações principais

### **Validações de Não Interferência**
```javascript
// Verificar se instância está sendo criada
if (manager.isCreatingInstance(instanceId)) {
  return res.status(423).json({ 
    error: 'Instância em processo de criação, aguarde'
  });
}

// Verificar se operação principal em andamento
if (manager.isInstanceLocked(instanceId)) {
  return res.status(423).json({ 
    error: 'Instância bloqueada para operação, tente novamente'
  });
}
```

## 📊 Comparação: Antes vs Depois

| Aspecto | Sistema Atual | Sistema Proposto |
|---------|---------------|------------------|
| **Linhas de código** | ~4.000 linhas | ~330 linhas |
| **Arquivos** | 17 arquivos | 3 arquivos |
| **APIs** | 18 endpoints | 4 endpoints |
| **Dependências** | Complexas | Mínimas |
| **Manutenção** | Alta complexidade | Baixa complexidade |
| **Performance** | Alto overhead | Baixo overhead |
| **Confiabilidade** | Múltiplos pontos de falha | Pontos de falha mínimos |
| **Funcionalidade** | Análise profunda | Verificação prática |

## 🎯 Benefícios Esperados

### **Simplicidade**
- ✅ Código mais limpo e legível
- ✅ Manutenção mais fácil
- ✅ Menos pontos de falha
- ✅ Deploy mais rápido

### **Robustez**
- ✅ Foco nas funcionalidades essenciais
- ✅ Menos overhead computacional
- ✅ Tempo de resposta mais rápido
- ✅ Maior estabilidade

### **Praticidade**
- ✅ Interface mais intuitiva
- ✅ Ações diretas (verificar + reiniciar)
- ✅ Feedback imediato
- ✅ Resolução rápida de problemas

## 🔄 Cronograma de Execução

### **Sprint 1: Desenvolvimento (2 dias)**
- Dia 1: Implementar service-monitor.js e service-restarter.js
- Dia 2: Criar APIs e interface web

### **Sprint 2: Teste e Migração (2 dias)**  
- Dia 3: Backup atual + Testes em paralelo
- Dia 4: Remoção do sistema antigo + Validação final

### **Total**: 4 dias para migração completa

---

**Este plano garante uma substituição segura e eficiente do sistema de diagnósticos atual por uma solução mais simples, robusta e focada nas necessidades reais de monitoramento e correção de serviços das instâncias.**