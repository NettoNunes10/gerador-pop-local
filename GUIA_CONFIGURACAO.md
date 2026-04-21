# Guia de Configuração Técnico: Gerador POP FM v2.1

Este guia detalha o funcionamento interno do sistema para administradores de rádio e desenvolvedores.

## 🛠️ Arquitetura do Sistema
O Gerador POP funciona em uma arquitetura de microsserviço local:
- **Backend (Python/FastAPI):** Gerencia o banco de dados SQLite, analisa arquivos de áudio (librosa) e executa o algoritmo de seleção musical.
- **Frontend (React/Vite):** Dashboard profissional para controle total sem necessidade de terminal.
- **Banco de Dados (SQLite):** Armazena o histórico de execuções (`historico_execucao`), a biblioteca catalogada (`biblioteca`) e multiplicadores de artistas.

---

## 📈 Lógica de Seleção (Scoring)
O algoritmo de seleção musical (`engine.py`) busca o candidato com a maior pontuação final.

### Fórmula do Score:
`FinalScore = TempoDeDescanso * PesoEspecifico * MultiplicadorArtista * FatorDayparting`

1.  **Tempo de Descanso:** Quantos minutos se passaram desde a última vez que a música tocou. Músicas que nunca tocaram recebem um valor de "descanso infinito" (10 dias) para priorizar a estreia.
2.  **Peso Específico:** Definido na tabela `biblioteca` (padrão 1.0). Permite priorizar músicas individuais.
3.  **Multiplicador de Artista:** Artistas na lista de "Favoritos" recebem um bônus (padrão 1.5x) para aumentar sua rotatividade.
4.  **Fator Dayparting:** Se a música tocou ontem na mesma janela de horário (+/- 1 hora), seu score é cortado pela METADE (0.5x). Isso evita que o ouvinte ouça a mesma música todo dia no caminho do trabalho.

---

## 🎵 Curva de Energia (BPM)
O sistema utiliza a biblioteca `librosa` para analisar o rimo das faixas durante a sincronização.

### Regras de Fluxo:
- **Lenta:** < 80 BPM
- **Média:** 80 - 120 BPM
- **Rápida:** > 120 BPM

> [!IMPORTANT]
> **Anti-Sequência Lenta:** O motor rastreia o BPM da última música tocada. Se ela foi classificada como "Lenta", o sistema filtrará e ignorará todas as músicas lentas da categoria atual para a próxima posição, garantindo que a rádio nunca perca o ritmo.

---

## 📂 Pastas e Caminhos
Configure estas pastas na aba **"Configurações"** do Dashboard:

| Caminho | Descrição |
| :--- | :--- |
| `MUSIC_ROOT` | Raiz onde estão as pastas de categorias (ex: Sertanejo A, POP B). |
| `TEMPLATES` | Onde ficam os arquivos `.blm` (mapa da programação). |
| `OUTPUT` | Pasta de destino dos arquivos `.bil` gerados. |
| `SWEEPERS` | Pasta base para vinhetas e identidades da rádio. |

---

## 🚀 Solução de Problemas (Troubleshooting)

### "Backend parou inesperadamente"
Isso geralmente ocorre por **conflito de porta**. O script `run.py` v2.1 agora detecta isso automaticamente e avisa se a porta 8000 já estiver sendo usada por outra instância.

### "Música não encontrada"
Certifique-se de que o `MUSIC_ROOT` no Dashboard termina com uma barra invertida no Windows (ex: `C:\Musicas\`) ou use o seletor de caminhos atualizado.

---
*Gerador POP FM v2.1 - Estabilidade e Inteligência em Automação Musical.*
