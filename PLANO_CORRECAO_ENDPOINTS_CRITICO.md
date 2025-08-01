# 🚨 PLANO DE CORREÇÃO CRÍTICA - Endpoints STUDIO, KONG e REST

## 🎯 SITUAÇÃO ATUAL

### **Problema Identificado**
- ❌ Servidor falha ao inicializar com erro: `Cannot find module './diagnostics/diagnostic-actions'`
- ❌ Endpoints STUDIO, KONG e REST não funcionam mesmo após reiniciar serviços
- ❌ Referências não comentadas ao objeto `diagnosticActions` no server.js

### **Causa Raiz**
Durante a remoção do sistema de diagnósticos complexo, apenas as **importações** foram comentadas, mas as **utilizações** do objeto `diagnosticActions` permaneceram ativas no código, causando falha crítica na inicialização.

### **Linhas Problemáticas Identificadas**
```javascript
// Linha ~3095: Verificação de segurança
const safety = diagnosticActions.isActionSafe(action, instanceId);

// Linhas ~3120-3142: Execução de ações
result = await diagnosticActions.restartContainer(instanceId, target);
result = await diagnosticActions.startContainer(instanceId, target);
result = await diagnosticActions.recreateService(instanceId, target);
result = await diagnosticActions.getContainerLogs(instanceId, target, lines);
result = await diagnosticActions.clearContainerLogs(instanceId, target);
result = await diagnosticActions.restartInstance(instanceId);

// Linha ~3179: Histórico de ações
const history = diagnosticActions.getActionHistory(req.params.id, limit);

// Linha ~3202: Estatísticas
const stats = diagnosticActions.getActionStats();
```

---

## 🔧 PLANO DE CORREÇÃO EMERGENCIAL

### **FASE 1: PREPARAÇÃO E SEGURANÇA** ⏱️ 10 minutos

#### **1.1 Backup Crítico**
```bash
# Criar backup timestamped do server.js atual
cp src/server.js "backup_sistema_diagnosticos/server_ANTES_CORRECAO_CRITICA_$(date +%Y%m%d_%H%M%S).js"
```

#### **1.2 Documentação do Estado Atual**
- ✅ Identificar todas as linhas com referências a `diagnosticActions`
- ✅ Mapear endpoints que serão afetados
- ✅ Validar que problema não afeta criação de instâncias

#### **1.3 Preparação de Rollback**
```bash
# Script de rollback rápido (caso necessário)
echo "cp backup_sistema_diagnosticos/server_ANTES_CORRECAO_CRITICA_*.js src/server.js" > rollback_emergencial.bat
```

---

### **FASE 2: CORREÇÃO CIRÚRGICA** ⏱️ 20 minutos

#### **2.1 Correção das Referências (CRÍTICO)**

**Ação**: Comentar/substituir todas as utilizações de `diagnosticActions`

**Linha ~3095**: Substituir verificação de segurança
```javascript
// ANTES (QUEBRADO):
const safety = diagnosticActions.isActionSafe(action, instanceId);

// DEPOIS (CORRIGIDO):
const safety = { safe: false, reason: 'Sistema de diagnósticos removido. Use Service Monitor.' };
```

**Linhas ~3120-3142**: Substituir ações por mensagens de migração
```javascript
// ANTES (QUEBRADO):
result = await diagnosticActions.restartContainer(instanceId, target);

// DEPOIS (CORRIGIDO):
result = { 
  success: false, 
  message: 'Sistema de diagnósticos removido. Use /api/instances/:id/restart-services',
  migration_needed: true 
};
```

**Linha ~3179**: Substituir histórico
```javascript
// ANTES (QUEBRADO):
const history = diagnosticActions.getActionHistory(req.params.id, limit);

// DEPOIS (CORRIGIDO):
const history = [];
```

**Linha ~3202**: Substituir estatísticas
```javascript
// ANTES (QUEBRADO):
const stats = diagnosticActions.getActionStats();

// DEPOIS (CORRIGIDO):
const stats = { message: 'Sistema migrado para Service Monitor' };
```

#### **2.2 Endpoints Temporários (COMPATIBILIDADE)**

Manter endpoints existentes com respostas informativas:
```javascript
// Endpoint de ação diagnóstica (compatibilidade)
app.post('/api/instances/:id/diagnostic-action', authenticateToken, checkProjectAccess, async (req, res) => {
  res.status(501).json({
    error: 'Sistema de diagnósticos migrado',
    message: 'Use os novos endpoints: /api/instances/:id/health e /api/instances/:id/restart-services',
    migration_guide: '/api/instances/:id/health'
  });
});
```

---

### **FASE 3: VALIDAÇÃO DE SEGURANÇA** ⏱️ 15 minutos

#### **3.1 Teste de Inicialização**
```bash
# Testar se servidor inicia sem erros
cd src
node server.js
# Aguardar: "🚀 Servidor rodando na porta XXXX"
```

#### **3.2 Validação de Instâncias Existentes**
- ✅ Verificar se instâncias existentes continuam listadas
- ✅ Testar acesso aos dashboards das instâncias ativas
- ✅ Validar que portas estão funcionando

#### **3.3 Teste de Criação de Nova Instância**
```bash
# Testar criação (usar interface web ou API)
POST /api/instances
{
  "projectName": "teste-pos-correcao",
  "config": {}
}
```

#### **3.4 Verificação dos Endpoints Principais**
Para cada instância ativa, verificar:
- ✅ `http://localhost:[STUDIO_PORT]` - Supabase Studio
- ✅ `http://localhost:[KONG_PORT]` - Kong Gateway  
- ✅ `http://localhost:[KONG_PORT]/rest/v1/` - PostgREST

---

### **FASE 4: IMPLEMENTAÇÃO DO SERVICE MONITOR** ⏱️ 2 horas (OPCIONAL)

*Esta fase deve ser executada APENAS após a correção crítica estar funcionando*

#### **4.1 Implementar service-monitor.js**
```javascript
// src/services/service-monitor.js
class ServiceMonitor {
  async checkInstance(instanceId, instance) {
    // Implementação simplificada do plano original
  }
}
```

#### **4.2 Implementar service-restarter.js**
```javascript
// src/services/service-restarter.js  
class ServiceRestarter {
  async restartInstanceServices(instanceId, instance) {
    // Implementação da reinicialização inteligente
  }
}
```

#### **4.3 Novos Endpoints**
```javascript
// Endpoints do Service Monitor
app.get('/api/instances/:id/health', ...);
app.post('/api/instances/:id/restart-services', ...);
app.get('/api/instances/health-summary', ...);
app.post('/api/instances/:id/restart-service/:serviceName', ...);
```

---

## ⚠️ RISCOS E MITIGAÇÕES

### **RISCOS IDENTIFICADOS**

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **Falha na inicialização do servidor** | Baixa | Alto | Backup + Rollback automático |
| **Instâncias existentes param de funcionar** | Muito Baixa | Alto | Não modificar código de instâncias |
| **Criação de novas instâncias falha** | Baixa | Médio | Testar antes de finalizar |
| **Endpoints quebram outras funcionalidades** | Muito Baixa | Baixo | Modificações cirúrgicas apenas |

### **PLANO DE CONTINGÊNCIA**

**Se algo der errado:**
```bash
# ROLLBACK IMEDIATO
cp backup_sistema_diagnosticos/server_ANTES_CORRECAO_CRITICA_*.js src/server.js
cd src && node server.js
```

**Se rollback não funcionar:**
```bash
# Restaurar do backup completo do sistema
cp backup_sistema_diagnosticos/server.js src/server.js
```

---

## 🚀 CRONOGRAMA DE EXECUÇÃO

### **🔴 URGENTE - Correção Crítica (45 minutos)**
- **0-10 min**: Fase 1 (Backup e Preparação)
- **10-30 min**: Fase 2 (Correção Cirúrgica)  
- **30-45 min**: Fase 3 (Validação de Segurança)

### **🟡 OPCIONAL - Service Monitor (2 horas)**
- **Após correção crítica**: Fase 4 (Implementação completa)

---

## ✅ CHECKLIST DE EXECUÇÃO

### **PRÉ-EXECUÇÃO**
- [ ] Backup do server.js criado
- [ ] Script de rollback preparado
- [ ] Instâncias ativas documentadas
- [ ] Portas ativas mapeadas

### **EXECUÇÃO**
- [ ] Referências a `diagnosticActions` corrigidas
- [ ] Servidor inicia sem erros
- [ ] Instâncias existentes funcionam
- [ ] Criação de nova instância testada
- [ ] Endpoints STUDIO/KONG/REST validados

### **PÓS-EXECUÇÃO**
- [ ] Logs limpos de erros
- [ ] Sistema estável por 30 minutos
- [ ] Documentação atualizada
- [ ] Backup da versão corrigida

---

## 🎯 RESULTADO ESPERADO

Após a execução deste plano:

✅ **Servidor iniciará sem erros**  
✅ **Endpoints STUDIO, KONG e REST funcionarão normalmente**  
✅ **Instâncias existentes continuarão operacionais**  
✅ **Criação de novas instâncias funcionará**  
✅ **Sistema estável e pronto para melhorias futuras**

---

## 📞 SUPORTE E EMERGÊNCIA

**Em caso de problemas:**
1. **Rollback imediato** usando os backups
2. **Verificar logs** em `src/logs/exceptions.log`
3. **Validar Docker** está rodando
4. **Reiniciar serviços** se necessário

**Este plano foi criado para ser executado com segurança máxima, priorizando a estabilidade do sistema sobre novas funcionalidades.**

---

*Documento criado em: ${new Date().toLocaleString('pt-BR')}*  
*Status: PRONTO PARA EXECUÇÃO*  
*Prioridade: 🚨 CRÍTICA*