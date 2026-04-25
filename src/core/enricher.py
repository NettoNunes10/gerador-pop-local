import os
import sys
from .database import db
from .config import config
import requests
import time

# Removida importação local do analyzer para evitar carregamento duplo de modelos na memória

class MusicEnricher:
    """
    Módulo integrado para enriquecimento de metadados usando IA (MusiCNN/DEAM).
    Mantém os modelos carregados na memória para alta performance.
    """
    def __init__(self):
        self.api_url = config.get_path('ENRICHMENT_API_URL') or "http://localhost:8001/enrich"
        print(f"📡 [ENRICHER] Modo API: Direcionando análises para {self.api_url}")

    def analyze_path(self, filepath):
        """Analisa um arquivo enviando-o para a API do Enricher (porta 8001)."""
        if not os.path.exists(filepath):
            return None
        try:
            response = requests.post(self.api_url, json={"path": filepath}, timeout=120)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"⚠️ [ENRICHER] API retornou erro {response.status_code}: {response.text}")
                return None
        except Exception as e:
            print(f"❌ [ENRICHER] Falha ao conectar na API de análise: {e}")
            return None

    def enrich_track(self, track_id):
        """Enriquece uma música específica pelo ID usando o motor de IA."""
        cursor = db.conn.cursor()
        cursor.execute("SELECT id, nome_musica, artista, caminho_arquivo FROM biblioteca WHERE id = ?", (track_id,))
        track = cursor.fetchone()
        
        if not track:
            return False, "Música não encontrada no banco."

        tid, title, artist, filepath = track
        
        if not os.path.exists(filepath):
            return False, f"Arquivo não encontrado: {filepath}"

        print(f"🔍 [ENRICHER] Analisando: {artist} - {title}")
        
        try:
            # Chama a API externa (8001) para análise pesada
            result = self.analyze_path(filepath)
            
            if not result or 'error' in result:
                return False, result.get('error', 'Erro desconhecido na API')
            
            # Atualiza o banco com os novos campos (incluindo Vibe e Valence)
            db.conn.execute('''
                UPDATE biblioteca SET 
                    bpm = ?, 
                    energy = ?, 
                    valence = ?, 
                    vibe = ? 
                WHERE id = ?
            ''', (result['bpm'], result['energy'], result['valence'], result['vibe'], tid))
            db.conn.commit()
            
            print(f"✨ [ENRICHER] Sucesso: {result['bpm']} BPM | Vibe: {result['vibe']} | Energia: {result['energy']}%")
            return True, result

        except Exception as e:
            print(f"❌ [ENRICHER] Erro na análise: {e}")
            return False, str(e)

    def enrich_pending(self):
        """Busca todas as músicas sem análise (BPM IS NULL) e processa em lote."""
        cursor = db.conn.cursor()
        cursor.execute("SELECT id FROM biblioteca WHERE bpm IS NULL")
        pending = cursor.fetchall()
        
        if not pending:
            print("📅 [ENRICHER] Nenhuma música pendente de análise.")
            return

        print(f"🚀 [ENRICHER] Iniciando lote de {len(pending)} músicas pendentes...")
        
        for (tid,) in pending:
            self.enrich_track(tid)
            
        print("✅ [ENRICHER] Lote de análise finalizado.")

if __name__ == "__main__":
    enricher = MusicEnricher()
    enricher.enrich_pending()
