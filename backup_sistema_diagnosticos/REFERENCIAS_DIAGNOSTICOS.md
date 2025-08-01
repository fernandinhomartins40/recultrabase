# Referências do Sistema de Diagnósticos

## 📁 Arquivos do Sistema Antigo

### Módulos Principais
- `src/diagnostics/health-checker.js` - Verificador de saúde (744 linhas)
- `src/diagnostics/diagnostic-actions.js` - Ações de diagnóstico (300+ linhas)
- `src/diagnostics/diagnostic-history.js` - Histórico de diagnósticos (221 linhas)
- `src/diagnostics/scheduled-diagnostics.js` - Diagnósticos agendados (300 linhas)
- `src/diagnostics/log-analyzer.js` - Analisador de logs (617 linhas)
- `src/diagnostics/interfaces/repair-api.js` - API de reparos (429 linhas)

### Módulos de Auto-Reparo
- `src/diagnostics/auto-repair/auto-repair-engine.js`
- `src/diagnostics/auto-repair/backup-manager.js`
- `src/diagnostics/auto-repair/container-fixer.js`
- `src/diagnostics/auto-repair/credential-manager.js`
- `src/diagnostics/auto-repair/intelligent-analyzer.js`
- `src/diagnostics/auto-repair/network-fixer.js`
- `src/diagnostics/auto-repair/rollback-manager.js`
- `src/diagnostics/auto-repair/service-fixer.js`

## 🔗 Referências no server.js

### Imports
```javascript
const HealthChecker = require('./diagnostics/health-checker');
const LogAnalyzer = require('./diagnostics/log-analyzer');
const DiagnosticHistory = require('./diagnostics/diagnostic-history');
const ScheduledDiagnostics = require('./diagnostics/scheduled-diagnostics');
const RepairAPI = require('./diagnostics/interfaces/repair-api');
```

### Instanciação
```javascript
this.healthChecker = new HealthChecker(config);
this.logAnalyzer = new LogAnalyzer(config);
const repairAPI = new RepairAPI(...);
const diagnosticHistory = new DiagnosticHistory();
const scheduledDiagnostics = new ScheduledDiagnostics();
```

## 🌐 APIs de Diagnósticos (18 endpoints)

### APIs Principais
- `GET /api/instances/:id/run-diagnostics`
- `GET /api/instances/:id/last-diagnostic`
- `GET /api/instances/:id/quick-health`
- `GET /api/instances/check-all-health`
- `GET /api/instances/:id/diagnostic-logs`
- `GET /api/instances/:id/test-auth-service`
- `POST /api/instances/:id/diagnostic-action`
- `GET /api/instances/:id/action-history`
- `GET /api/instances/:id/action-stats`
- `GET /api/instances/:id/diagnostic-history`
- `GET /api/instances/:id/health-report`

### APIs Globais
- `GET /api/diagnostics/global-stats`
- `POST /api/diagnostics/cleanup`
- `POST /api/instances/:id/schedule-diagnostics`
- `GET /api/instances/:id/schedule-diagnostics`
- `PUT /api/instances/:id/schedule-diagnostics`
- `DELETE /api/instances/:id/schedule-diagnostics`
- `GET /api/instances/:id/cron-script`
- `GET /api/diagnostics/schedules`
- `GET /api/diagnostics/full-cron-script`

### APIs de Reparo
- `POST /api/instances/:id/safe-restart`
- `POST /api/instances/:id/auto-repair`

## 🖼️ Interface (index.html)

### Funções JavaScript
- `showDiagnosticPanel(instanceId, instanceName)`
- `runDiagnostic()`
- `loadDiagnosticHistory()`
- `closeDiagnosticDrawer()`

### Drawer de Diagnósticos
- `#diagnostic-drawer` - Drawer principal
- `#diagnostic-backdrop` - Backdrop do drawer
- `#run-diagnostic-btn` - Botão executar diagnóstico

### Referências no Template
- Botão "Diagnósticos" nos cards das instâncias
- Chamadas automáticas após restart de instâncias

## 🔄 Sistema Novo (Substituição)

### Novos Módulos
- `src/services/service-monitor.js` - Substituí HealthChecker
- `src/services/service-restarter.js` - Substituí RepairAPI

### Novas APIs (4 endpoints)
- `GET /api/instances/:id/health` - Substituí run-diagnostics
- `POST /api/instances/:id/restart-services` - Substituí auto-repair
- `GET /api/instances/health-summary` - Substituí check-all-health
- `POST /api/instances/:id/restart-service/:serviceName` - Novo

### Nova Interface
- `showInstanceHealthPanel()` - Substituí showDiagnosticPanel
- Drawer "Saúde da Instância" - Substituí drawer de diagnósticos

## ⚠️ Pontos de Atenção na Remoção

1. **Remover imports** do server.js
2. **Remover instanciações** das classes
3. **Remover todas as APIs** antigas
4. **Remover funções JavaScript** do index.html
5. **Remover drawer de diagnósticos** do HTML
6. **Atualizar chamadas** após restart de instâncias
7. **Verificar logs** para referências perdidas

## 📊 Comparação

| Aspecto | Sistema Antigo | Sistema Novo |
|---------|---------------|--------------|
| Arquivos | 17 arquivos | 2 arquivos |
| Linhas | ~4.000 linhas | ~650 linhas |
| APIs | 18 endpoints | 4 endpoints |
| Complexidade | Alta | Baixa |
| Manutenção | Difícil | Simples |

---
*Backup criado em: $(date)*
*Fase 2 do Plano de Substituição dos Diagnósticos*