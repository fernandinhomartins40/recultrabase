# 📋 DOCUMENTAÇÃO - LINHAS PARA CORREÇÃO DE TOKEN

## 🎯 **ARQUIVO:** `src/public/index.html`
## 🕒 **DATA:** 01/08/2025 12:00
## 📦 **BACKUP:** `backup_sistema_diagnosticos/index_ANTES_TOKEN_FIX_20250801_120000.html`

---

## 🚨 **CORREÇÕES CRÍTICAS (Prioridade 1)**

### **1. Função `restartInstanceServices()` - Linha 5926**
- **Localização**: Linha 5926
- **Contexto**: Dentro da função `async function restartInstanceServices()`
- **Problema**: `headers: { 'Content-Type': 'application/json' }` sem Authorization
- **Correção**: Substituir por `headers: authManager.getAuthHeaders()`

**Código atual (linha 5924-5928):**
```javascript
const response = await fetch(`/api/instances/${currentHealthInstanceId}/restart-services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // ← LINHA 5926 - PROBLEMÁTICA
    body: JSON.stringify({ forceAll: false })
});
```

### **2. Função `restartSpecificService()` - Linha 6073-6075**
- **Localização**: Linha 6073-6075
- **Contexto**: Dentro da função `async function restartSpecificService(serviceName)`
- **Problema**: Sem headers de autenticação
- **Correção**: Adicionar `headers: authManager.getAuthHeaders()`

**Código atual (linha 6073-6075):**
```javascript
const response = await fetch(`/api/instances/${currentHealthInstanceId}/restart-service/${serviceName}`, {
    method: 'POST' // ← SEM HEADERS - PROBLEMÁTICO
});
```

---

## ⚠️ **CORREÇÕES IMPORTANTES (Prioridade 2)**

### **3. Função `executeSql()` - Linha 5139-5142**
- **Localização**: Linha 5139-5142
- **Contexto**: Dentro da função `async function executeSql(projectId)`
- **Problema**: Headers sem Authorization
- **Correção**: Substituir por `headers: authManager.getAuthHeaders()`

**Código atual (linha 5139-5142):**
```javascript
const response = await fetch(`/api/instances/${projectId}/execute-sql`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json' // ← PROBLEMÁTICO
    },
    body: JSON.stringify({ query: sqlQuery })
});
```

### **4. Outras funções SQL/Webhook que precisam ser identificadas:**
- `createSQLWebhook()` - estimativa linha ~5320
- `listWebhooks()` - estimativa linha ~5380
- `revokeWebhook()` - estimativa linha ~5433
- Auto-reparo - estimativa linha ~6386

---

## 🔧 **ESTRATÉGIA DE CORREÇÃO**

### **Padrão de Correção:**
```javascript
// ❌ ANTES
headers: { 'Content-Type': 'application/json' }

// ✅ DEPOIS  
headers: authManager.getAuthHeaders()
```

### **Para casos sem headers:**
```javascript
// ❌ ANTES
method: 'POST'

// ✅ DEPOIS
method: 'POST',
headers: authManager.getAuthHeaders()
```

---

## 📝 **CHECKLIST DE CORREÇÕES**

### **FASE 2 - Correções Críticas:**
- [ ] **Linha 5926**: `restartInstanceServices()` - headers
- [ ] **Linha 6073-6075**: `restartSpecificService()` - adicionar headers

### **FASE 3 - Correções Importantes:**
- [ ] **Linha ~5139-5142**: `executeSql()` - headers
- [ ] **Localizar e corrigir**: `createSQLWebhook()`
- [ ] **Localizar e corrigir**: `listWebhooks()`
- [ ] **Localizar e corrigir**: `revokeWebhook()`
- [ ] **Localizar e corrigir**: Auto-reparo

---

## 🚨 **SCRIPT DE ROLLBACK**

Em caso de problemas, usar:
```bash
cp backup_sistema_diagnosticos/index_ANTES_TOKEN_FIX_20250801_120000.html src/public/index.html
```

---

## ✅ **VALIDAÇÃO PÓS-CORREÇÃO**

Comandos para validar as correções:
```bash
# Verificar se não há mais headers problemáticos
grep -n "headers.*Content-Type.*json" src/public/index.html | grep -v Authorization

# Contar ocorrências de authManager.getAuthHeaders()
grep -n "authManager.getAuthHeaders()" src/public/index.html | wc -l

# Verificar se todas as funções críticas foram corrigidas
grep -n -A3 "restart-services\|restart-service\|execute-sql" src/public/index.html
```

---

**STATUS**: ✅ Documentação completa - Pronto para Fase 2