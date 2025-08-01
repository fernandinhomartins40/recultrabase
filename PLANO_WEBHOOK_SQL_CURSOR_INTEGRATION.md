# Plano de Implementação: Webhook para Execução SQL via Cursor

## 🎯 Objetivo
Implementar um sistema de webhook seguro que permita ao Cursor IDE executar comandos SQL diretamente nas instâncias Supabase através de um endpoint copiável, sem comprometer a segurança ou interferir na criação/gerenciamento de instâncias.

## 📋 Análise da Situação Atual

### **Função Existente**
- **Endpoint**: `POST /api/instances/:id/execute-sql`
- **Autenticação**: Token JWT do usuário (`authenticateToken`)
- **Autorização**: Verificação de acesso ao projeto (`checkProjectAccess`)
- **Funcionalidade**: Executa SQL diretamente no PostgreSQL da instância
- **Localização**: `server.js:4445-4475`

### **Limitações Atuais**
1. **Dependência de sessão web**: Requer token de usuário logado
2. **Sem webhook dedicado**: Não há endpoint público para integração externa
3. **Sem rate limiting**: Pode ser abusado se exposto
4. **Logs limitados**: Pouco controle de auditoria para execuções externas

## 🏗️ Arquitetura Proposta

### **1. Sistema de Webhook Tokens**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Cursor IDE    │───▶│  Webhook Token  │───▶│  SQL Executor   │
│                 │    │   Authentication│    │   (Isolated)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  Rate Limiting  │    │   PostgreSQL    │
                       │  & Audit Logs   │    │   Instance DB   │
                       └─────────────────┘    └─────────────────┘
```

### **2. Estrutura de Implementação**
```
src/
├── webhooks/
│   ├── sql-webhook-manager.js     # Gerenciamento de webhooks
│   ├── webhook-auth.js            # Autenticação específica
│   ├── sql-execution-limiter.js   # Rate limiting e quotas
│   └── webhook-audit.js           # Logs e auditoria
├── middleware/
│   └── webhook-middleware.js      # Middleware de segurança
└── routes/
    └── webhook-sql-routes.js      # Endpoints de webhook
```

## 🔐 Plano de Segurança

### **Autenticação Multicamada**

#### **1. Webhook Token System**
```javascript
// Estrutura do Token
{
  "webhook_id": "wh_cursor_sql_abc123",
  "instance_id": "instance_uuid",
  "user_id": "user_uuid", 
  "permissions": ["sql:read", "sql:write", "sql:ddl"],
  "rate_limits": {
    "requests_per_minute": 30,
    "daily_quota": 1000
  },
  "expires_at": "2024-12-31T23:59:59Z",
  "created_at": "2024-08-01T10:00:00Z",
  "ip_whitelist": ["cursor.ide.ip.ranges"],
  "sql_restrictions": {
    "blocked_patterns": ["DROP DATABASE", "DELETE FROM auth"],
    "allowed_schemas": ["public", "custom"],
    "max_query_size": 10240
  }
}
```

#### **2. Níveis de Permissão**
- **READ_ONLY**: Apenas SELECT queries
- **STANDARD**: SELECT, INSERT, UPDATE (sem system tables)
- **DEVELOPER**: Inclui CREATE/ALTER para schema público
- **ADMIN**: Acesso completo (apenas para owners)

### **Isolamento de Recursos**

#### **1. Separação de Pools de Conexão**
```javascript
// Pool dedicado para webhooks
const webhookPool = new Pool({
  max: 5, // Limite baixo para webhooks
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Pool separado do sistema principal
});
```

#### **2. Rate Limiting Granular**
- **Por webhook token**: 30 req/min, 1000/dia
- **Por instância**: 100 req/min total
- **Por IP**: 50 req/min
- **Queries simultâneas**: Máximo 3 por webhook

## 🛠️ Implementação Detalhada

### **Fase 1: Core Webhook System**

#### **1.1 SQL Webhook Manager**
```javascript
// src/webhooks/sql-webhook-manager.js
class SQLWebhookManager {
  async createWebhook(userId, instanceId, permissions) {
    const webhookToken = this.generateSecureToken();
    const webhook = {
      id: `wh_cursor_sql_${nanoid()}`,
      token: webhookToken,
      user_id: userId,
      instance_id: instanceId,
      permissions: permissions,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
      status: 'active',
      rate_limits: this.getDefaultRateLimits(permissions),
      usage_stats: { total_requests: 0, last_used: null }
    };
    
    await this.saveWebhook(webhook);
    return webhook;
  }
  
  async validateWebhook(token, instanceId) {
    // Validação de token, expiração, rate limits
  }
  
  generateWebhookUrl(instanceId, token) {
    return `${process.env.WEBHOOK_BASE_URL}/webhook/sql/${instanceId}?token=${token}`;
  }
}
```

#### **1.2 Webhook Routes**
```javascript
// src/routes/webhook-sql-routes.js
app.post('/webhook/sql/:instanceId', 
  webhookAuth,           // Validação de token webhook
  rateLimitWebhook,      // Rate limiting específico  
  sqlSecurityCheck,      // Validação de query SQL
  auditWebhookRequest,   // Log de auditoria
  async (req, res) => {
    const { query, transaction_id } = req.body;
    
    try {
      const result = await executeSQLWebhook(
        req.params.instanceId,
        query,
        req.webhook_context
      );
      
      res.json({
        success: true,
        transaction_id,
        result: result,
        executed_at: new Date().toISOString()
      });
    } catch (error) {
      await this.logWebhookError(req.webhook_context, error);
      res.status(400).json({ error: error.message });
    }
  }
);
```

### **Fase 2: Segurança e Limitações**

#### **2.1 SQL Security Checker**
```javascript
// src/webhooks/sql-security-checker.js
class SQLSecurityChecker {
  validateQuery(query, permissions) {
    // Análise estática da query
    const parsed = this.parseSQL(query);
    
    // Blocked patterns
    if (this.containsBlockedPattern(query)) {
      throw new Error('Query contains blocked SQL patterns');
    }
    
    // Schema restrictions
    if (!this.isAllowedSchema(parsed.schema, permissions)) {
      throw new Error('Access to schema not permitted');
    }
    
    // Permission checks
    if (!this.hasPermissionForOperation(parsed.operation, permissions)) {
      throw new Error('Insufficient permissions for operation');
    }
    
    return true;
  }
  
  containsBlockedPattern(query) {
    const blockedPatterns = [
      /DROP\s+DATABASE/i,
      /DELETE\s+FROM\s+auth\./i,
      /TRUNCATE\s+auth\./i,
      /ALTER\s+SYSTEM/i,
      /CREATE\s+EXTENSION/i,
      /pg_terminate_backend/i
    ];
    
    return blockedPatterns.some(pattern => pattern.test(query));
  }
}
```

#### **2.2 Rate Limiter**
```javascript
// src/webhooks/sql-execution-limiter.js
class SQLExecutionLimiter {
  async checkRateLimit(webhookId, instanceId) {
    const limits = await this.getRateLimits(webhookId);
    const current = await this.getCurrentUsage(webhookId);
    
    // Per-minute check
    if (current.requests_this_minute >= limits.requests_per_minute) {
      throw new Error('Rate limit exceeded: requests per minute');
    }
    
    // Daily quota check
    if (current.requests_today >= limits.daily_quota) {
      throw new Error('Daily quota exceeded');
    }
    
    // Concurrent queries check
    if (current.concurrent_queries >= limits.max_concurrent) {
      throw new Error('Maximum concurrent queries reached');
    }
    
    return true;
  }
}
```

### **Fase 3: Interface de Usuário**

#### **3.1 Drawer Cursor Integration - Nova Seção**
```html
<div class="automation-section">
  <h4><i data-lucide="webhook" class="lucide lucide-sm"></i> Webhook para Cursor IDE</h4>
  <p class="automation-description">Configure um webhook dedicado para execução SQL direta do Cursor:</p>
  
  <div class="webhook-config">
    <div class="webhook-permissions">
      <label>Nível de Permissão:</label>
      <select id="webhook-permission-level">
        <option value="read_only">Apenas Leitura (SELECT)</option>
        <option value="standard">Padrão (SELECT, INSERT, UPDATE)</option>
        <option value="developer">Desenvolvedor (+CREATE/ALTER)</option>
        <option value="admin">Administrador (Acesso Completo)</option>
      </select>
    </div>
    
    <div class="webhook-actions">
      <button class="btn btn-primary" onclick="createSQLWebhook('${config.project_id}')">
        <i data-lucide="plus" class="lucide lucide-sm"></i>
        Criar Webhook
      </button>
      <button class="btn btn-secondary" onclick="listWebhooks('${config.project_id}')">
        <i data-lucide="list" class="lucide lucide-sm"></i>
        Gerenciar Webhooks
      </button>
    </div>
    
    <div id="webhook-result" class="webhook-result" style="display: none;">
      <div class="webhook-url-container">
        <label>URL do Webhook (copie para o Cursor):</label>
        <div class="webhook-url-display">
          <input type="text" id="webhook-url" readonly>
          <button class="copy-btn" onclick="copyWebhookUrl()">
            <i data-lucide="copy" class="lucide lucide-sm"></i>
          </button>
        </div>
      </div>
      
      <div class="webhook-details">
        <p><strong>Rate Limits:</strong> 30 req/min, 1000/dia</p>
        <p><strong>Expira em:</strong> <span id="webhook-expires"></span></p>
        <p><strong>Token:</strong> <code id="webhook-token"></code></p>
      </div>
    </div>
  </div>
</div>
```

## ⚠️ Cuidados com a Criação de Instâncias

### **Isolamento Completo**

#### **1. Pool de Conexões Separado**
- Webhooks usam pool dedicado com limites baixos
- Pool principal não é afetado pelas conexões webhook
- Timeouts agressivos para liberar conexões rapidamente

#### **2. Namespace de APIs Isolado**
```
/api/instances/*           <- APIs principais (não afetadas)
/webhook/sql/*            <- APIs de webhook (isoladas)
/webhook/management/*     <- Gerenciamento de webhooks
```

#### **3. Rate Limiting Independente**
- Limitadores separados por contexto
- Webhook rate limits não afetam operações de usuário
- Quotas por instância para prevenir sobrecarga

### **Monitoramento e Alertas**

#### **1. Métricas de Segurança**
```javascript
// Métricas coletadas
{
  webhook_requests_per_minute: 15,
  failed_auth_attempts: 2,  
  blocked_sql_patterns: 1,
  avg_query_execution_time: 45ms,
  active_webhook_connections: 3,
  rate_limit_violations: 0
}
```

#### **2. Alerts Automáticos**
- **Alta utilização**: > 80% da quota diária
- **Queries suspeitas**: Padrões de SQL bloqueados
- **Rate limit violations**: Múltiplas tentativas
- **Conexões lentas**: > 10s execução

### **Backup e Recovery**

#### **1. Logs de Auditoria**
```javascript
// Log estruturado para cada execução
{
  timestamp: "2024-08-01T10:30:00Z",
  webhook_id: "wh_cursor_sql_abc123",
  instance_id: "uuid",
  user_id: "uuid",
  query_hash: "sha256_hash",
  execution_time_ms: 45,
  rows_affected: 1,
  success: true,
  ip_address: "1.2.3.4",
  user_agent: "Cursor/1.0"
}
```

#### **2. Rollback Capability**
- Logs detalhados de todas as operações DDL
- Scripts de rollback automático para operações críticas
- Backup automático antes de operações destrutivas

## 🚀 Fases de Implementação

### **Fase 1: Core Infrastructure (Sprint 1)**
- [ ] Webhook token system
- [ ] Autenticação básica
- [ ] Rate limiting básico
- [ ] SQL security checker

### **Fase 2: Security Hardening (Sprint 2)**
- [ ] Permissões granulares
- [ ] IP whitelisting
- [ ] Auditoria completa
- [ ] Monitoramento de métricas

### **Fase 3: UI Integration (Sprint 3)**
- [ ] Interface no drawer Cursor
- [ ] Gerenciamento de webhooks
- [ ] Dashboard de métricas
- [ ] Documentação de uso

### **Fase 4: Advanced Features (Sprint 4)**
- [ ] Query templates
- [ ] Bulk operations
- [ ] Webhook versioning
- [ ] Advanced analytics

## 📊 Métricas de Sucesso

### **Performance**
- **Latência**: < 100ms para queries simples
- **Throughput**: 30 req/min por webhook
- **Disponibilidade**: 99.9% uptime

### **Segurança**
- **Zero false positives**: SQL válido não bloqueado
- **Zero data breaches**: Nenhum acesso não autorizado
- **100% auditoria**: Todas as operações logadas

### **Usabilidade**
- **Setup time**: < 2 minutos para criar webhook
- **Integration effort**: < 10 linhas de código no Cursor
- **Error rate**: < 1% de falhas por questões técnicas

## 🔗 Exemplo de Uso no Cursor

### **Configuração**
```javascript
// cursor-config.js
const WEBHOOK_URL = "https://your-domain.com/webhook/sql/instance-id";
const WEBHOOK_TOKEN = "wh_cursor_sql_token_here";

async function executeSQLViaCursor(query) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Token': WEBHOOK_TOKEN
    },
    body: JSON.stringify({ 
      query: query,
      transaction_id: `cursor_${Date.now()}`
    })
  });
  
  return await response.json();
}
```

### **Uso Prático**
```javascript
// Exemplo de uso no Cursor
await executeSQLViaCursor(`
  CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    theme VARCHAR(20) DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

await executeSQLViaCursor(`
  INSERT INTO user_preferences (user_id, theme, language) 
  VALUES ('user-uuid-here', 'dark', 'pt-BR');
`);
```

## 📋 Checklist de Implementação

### **Segurança**
- [ ] Validação de token webhook
- [ ] Rate limiting implementado
- [ ] SQL injection protection
- [ ] Permission system ativo
- [ ] Audit logging funcionando
- [ ] IP whitelisting (opcional)

### **Funcionalidade**
- [ ] Execução de SQL básica
- [ ] Error handling robusto
- [ ] Connection pooling isolado
- [ ] Transaction support
- [ ] Query timeout configurável

### **Interface**
- [ ] Drawer integration completa
- [ ] Webhook creation flow
- [ ] Copy webhook URL funcionando
- [ ] Webhook management UI
- [ ] Usage statistics dashboard

### **Monitoramento**
- [ ] Métricas de performance
- [ ] Alerts de segurança
- [ ] Logs estruturados
- [ ] Health checks
- [ ] Error tracking

---

**Documento criado em**: 2024-08-01  
**Versão**: 1.0  
**Status**: Plano de Implementação  
**Prioridade**: Alta  

Este plano fornece uma base sólida para implementar webhooks SQL seguros sem comprometer a funcionalidade existente do sistema de gerenciamento de instâncias.