# 🚀 GUIA PARA ATUALIZAR VPS

## 🎯 **OBJETIVO**
Atualizar o código na VPS com os commits de debug dos botões de diagnóstico.

## 📋 **COMMITS PARA ATUALIZAR**
- **3efb21d** - DEBUG: Adicionar logs para investigar botões de diagnóstico
- **2ee6ef7** - ENHANCE: Validar e documentar sistema de diagnósticos completo

## 🔧 **COMANDOS PARA EXECUTAR NA VPS**

### **1. Conectar à VPS**
```bash
ssh root@82.25.69.57
# ou
ssh usuario@82.25.69.57
```

### **2. Navegar para o diretório do projeto**
```bash
cd /caminho/para/recultrabase
# ou
cd ~/recultrabase
# ou verificar onde está:
find / -name "recultrabase" -type d 2>/dev/null
```

### **3. Verificar status atual**
```bash
git status
git log --oneline -5
```

### **4. Fazer pull das atualizações**
```bash
git pull origin main
```

### **5. Verificar se atualizou**
```bash
git log --oneline -3
# Deve mostrar:
# 3efb21d DEBUG: Adicionar logs para investigar botões de diagnóstico
# 2ee6ef7 ENHANCE: Validar e documentar sistema de diagnósticos completo
```

### **6. Reiniciar o servidor Node.js**
```bash
# Se usando PM2:
pm2 restart all
# ou
pm2 restart ultrabase

# Se usando systemctl:
sudo systemctl restart ultrabase
# ou
sudo systemctl restart node-app

# Se rodando diretamente:
# Pare o processo (Ctrl+C) e reinicie:
cd src && node server.js
```

### **7. Verificar se servidor está rodando**
```bash
# Se usando PM2:
pm2 list
pm2 logs

# Se usando systemctl:
sudo systemctl status ultrabase

# Verificar portas:
netstat -tlnp | grep 3080
```

## 🌐 **TESTAR AS ATUALIZAÇÕES**

### **1. Abrir no navegador:**
```
http://82.25.69.57:3080
# ou
https://ultrabase.com.br
```

### **2. Abrir Console do Navegador (F12)**

### **3. Recarregar a página (Ctrl+F5)**

### **4. Procurar por logs de debug:**
```
🔧 DEBUG: JavaScript carregado, DOM pronto
🔧 DEBUG: Funções disponíveis: {showDiagnosticPanel: "function", ...}
```

### **5. Clicar no botão "Diagnósticos" de uma instância**

### **6. Verificar se aparecem os logs:**
```
🔧 DEBUG: showDiagnosticPanel chamada {instanceId: "...", instanceName: "..."}
🔧 DEBUG: Elementos encontrados {drawer: true, backdrop: true, title: true}
🔧 DEBUG: Classes adicionadas, drawer deve estar visível
```

## 🚨 **POSSÍVEIS PROBLEMAS**

### **Problema 1: Erro de permissão no git pull**
```bash
# Solução:
sudo chown -R $USER:$USER .git
git pull origin main
```

### **Problema 2: Conflitos de merge**
```bash
# Solução:
git stash
git pull origin main
git stash pop
```

### **Problema 3: Servidor não reinicia**
```bash
# Verificar processos:
ps aux | grep node
# Matar processo se necessário:
pkill -f node
# Reiniciar:
cd src && node server.js
```

### **Problema 4: Porta já em uso**
```bash
# Verificar o que está usando a porta:
sudo lsof -i :3080
# Matar processo:
sudo kill -9 <PID>
```

## 📞 **SE PRECISAR DE AJUDA**

### **Verificar logs do servidor:**
```bash
# Logs gerais:
journalctl -u ultrabase -f

# Logs do PM2:
pm2 logs

# Logs customizados:
tail -f ~/recultrabase/src/logs/application-*.log
```

### **Verificar conectividade:**
```bash
curl http://localhost:3080
curl http://82.25.69.57:3080
```

## ✅ **CHECKLIST DE ATUALIZAÇÃO**

- [ ] Conectar à VPS via SSH
- [ ] Navegar para diretório do projeto
- [ ] Verificar status do git
- [ ] Executar `git pull origin main`
- [ ] Verificar se commits foram puxados
- [ ] Reiniciar servidor Node.js
- [ ] Verificar se servidor está rodando
- [ ] Testar no navegador
- [ ] Verificar logs de debug no console
- [ ] Testar botão de diagnóstico
- [ ] Confirmar que logs aparecem

## 🎯 **RESULTADO ESPERADO**

Após seguir estes passos, os botões de diagnóstico devem:
1. ✅ Mostrar logs detalhados no console
2. ✅ Abrir o drawer de diagnóstico
3. ✅ Permitir identificar exatamente onde está o problema

**Se ainda não funcionar, os logs mostrarão exatamente o que está impedindo o funcionamento!**