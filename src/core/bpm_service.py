import requests
import time
import os
import re

class BPMService:
    def __init__(self):
        self.base_url = "https://api.deezer.com"
        self.last_request_time = 0
        self.request_interval = 0.2 # 5 requests per second para segurança total

    def _wait_for_rate_limit(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.request_interval:
            time.sleep(self.request_interval - elapsed)
        self.last_request_time = time.time()

    def _clean_text(self, text):
        # Limpa (Ao Vivo), Part., etc.
        text = re.sub(r'[\(\[][^\]\)]*[\)\]]', '', text)
        text = re.sub(r'\b(PART|FT|FEAT|PARTICIPAÇÃO)\b.*', '', text, flags=re.IGNORECASE)
        return text.strip()

    def get_bpm_from_deezer(self, artist, title):
        """Busca o BPM na API do Deezer."""
        self._wait_for_rate_limit()
        clean_artist = self._clean_text(artist)
        clean_title = self._clean_text(title)
        
        search_query = f'artist:"{clean_artist}" track:"{clean_title}"'
        url = f"{self.base_url}/search?q={search_query}"
        
        try:
            print(f"[DEEZER] 🔎 Buscando: {clean_artist} - {clean_title}...")
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                items = data.get('data', [])
                if items:
                    # O Deezer não retorna o BPM no Search, precisamos do ID da Track
                    track_id = items[0]['id']
                    return self.get_track_details(track_id)
            print(f"[DEEZER] ❌ Música não encontrada.")
        except Exception as e:
            print(f"[DEEZER] ❌ Erro na busca: {e}")
        return None

    def get_track_details(self, track_id):
        """Pega detalhes da track (incluindo BPM)."""
        self._wait_for_rate_limit()
        url = f"{self.base_url}/track/{track_id}"
        try:
            res = requests.get(url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                bpm = data.get('bpm', 0)
                if bpm > 0:
                    print(f"[DEEZER] ✅ BPM encontrado: {bpm}")
                    return bpm
            print(f"[DEEZER] ⚠️ Deezer não possui o BPM desta música.")
        except Exception as e:
            print(f"[DEEZER] ❌ Erro ao obter detalhes: {e}")
        return None

    def get_bpm_locally(self, filepath):
        """Calcula o BPM localmente usando librosa (Fallback)."""
        try:
            import librosa
            import numpy as np
            
            print(f"[LOCAL] 🎧 Analisando áudio localmente: {os.path.basename(filepath)}...")
            # Carrega apenas os primeiros 40 segundos para ser rápido
            y, sr = librosa.load(filepath, duration=40)
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            
            # O librosa retorna um array ou float dependendo da versão
            bpm = float(tempo[0]) if isinstance(tempo, (np.ndarray, list)) else float(tempo)
            
            if bpm > 0:
                print(f"[LOCAL] ✅ BPM calculado: {round(bpm)}")
                return round(bpm)
        except ImportError:
            print("[LOCAL] ⚠️ Biblioteca 'librosa' não instalada. Execute: pip install librosa")
        except Exception as e:
            print(f"[LOCAL] ❌ Erro na análise local: {e}")
        return 0

bpm_service = BPMService()
