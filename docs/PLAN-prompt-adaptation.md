# PLAN-prompt-adaptation.md

## Contexto
Temos um agente robusto de exemplo (`prompt_vivaz.txt` - Clínica Estética) com regras avançadas de fluxo, tools e segurança. Queremos aplicar essa mesma **estrutura de engenharia de prompt** ao agente atual (`agent_manager.py` - Palmas Lake Residence).

## 🎯 Objetivos
1. **Migrar Estrutura XML**: Adotar as tags `<tools_system>`, `<security>`, `<conversation_states>` do prompt Vivaz.
2. **Mapear Tools**:
   - `apresentar_procedimentos` -> `enviar_carrossel` (Catálogo de Imóveis: Garden, Padrão, Penthouse).
   - `agendador` -> `agenda` (Visita ao Stand).
   - `verificar_horario_limite` -> Regras de horário do Stand (Seg-Sáb 9h-18h).
3. **Externalizar Prompt**: Mover o prompt "hardcoded" do `agent_manager.py` para um arquivo `apps/api/prompts/SOFIA_SYSTEM.md` para facilitar manutenção.

## 📋 Steps

### Phase 1: Criação do Novo System Prompt
- [ ] Criar arquivo `apps/api/prompts/SOFIA_SYSTEM.md`.
- [ ] **Seção Tools**: Definir regras estritas para `enviar_carrossel` (ex: mostrar fachadas, plantas) e `agenda`.
- [ ] **Seção Estados**: Definir S0 (Boas-vindas), S1 (Qualificação), S2 (Apresentação Imóvel), S3 (Agendamento).
- [ ] **Seção Catálogo**: Inserir dados do `agent_manager.py` (Tipologias: Garden, Padrão, Penthouse) no formato da Vivaz.
- [ ] **Seção Regras**: Adaptar regras de "Janela de Unha/Estética" para "Horário de Visita ao Stand".

### Phase 2: Refatoração do Agent Manager
- [ ] Modificar `apps/api/services/agent_manager.py`.
- [ ] Remover string gigante `self.system_prompt`.
- [ ] Adicionar método `load_prompt()` para ler o arquivo `.md`.
- [ ] Garantir injeção dinâmica de data em `<current_datetime>`.

### Phase 3: Validação
- [ ] Testar fluxo S0 -> S1 (Nome, Reação, Identificação).
- [ ] Testar fluxo S2 (Envio de Carrossel de Imóveis).
- [ ] Testar fluxo S3 (Agendamento de Visita).

## 💡 Mapeamento de Tools (Vivaz -> Sofia)
| Vivaz Tool | Sofia Tool | Regra Adaptada |
|------------|------------|----------------|
| `Atualizar_cliente` | `atualizar_nome` | Manter regra "Single Execution" |
| `reagir_nome` | `reagir_nome` | Manter regra "Imediato após nome" |
| `apresentar_procedimentos` | `enviar_carrossel` | Exibir Tipologias (Garden, Padrão...) |
| `agendador` | `agenda` | Agendar visita (1h duração padrão) |
| `verificar_horario_limite` | (Lógica interna) | Stand: Seg-Sáb 09h-18h, Dom 10h-16h |
