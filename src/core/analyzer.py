import librosa
import numpy as np

class AudioAnalyzer:
    @staticmethod
    def get_bpm(filepath):
        try:
            # Carregar apenas os primeiros 45 segundos para análise rápida
            y, sr = librosa.load(filepath, duration=45, sr=22050)
            
            # Filtragem harmônica/percussiva pode ajudar na precisão do beat tracking
            y_percussive = librosa.effects.percussive(y)
            
            # Estimar o tempo (BPM)
            tempo, _ = librosa.beat.beat_track(y=y_percussive, sr=sr)
            
            # tempo é retornado como um array ou float dependendo da versão
            if isinstance(tempo, np.ndarray):
                return float(tempo[0])
            return float(tempo)
        except Exception as e:
            print(f"Erro ao analisar BPM de {filepath}: {e}")
            return 0.0

analyzer = AudioAnalyzer()
