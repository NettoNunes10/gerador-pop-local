import numpy as np
import os
import json
try:
    from analyzer import MusicAnalyzer
except ImportError:
    from src.services.enricher.analyzer import MusicAnalyzer

def calibrate():
    analyzer = MusicAnalyzer()
    if not analyzer.ai_ready:
        print("Erro: IA não carregada.")
        return

    import librosa
    import soundfile as sf

    # 1. Teste de Silêncio
    silent_path = "silent_test.wav"
    sf.write(silent_path, np.zeros(16000 * 5), 16000)
    
    # 2. Teste de Ruído Máximo (Energia total)
    noise_path = "noise_test.wav"
    sf.write(noise_path, np.random.uniform(-1, 1, 16000 * 5), 16000)

    print("\n--- CALIBRAÇÃO DE IA ---")
    
    print("Analisando Silêncio...")
    res_s = analyzer._extract_ai_features(silent_path)
    print(f"Resultado Silêncio: {res_s}")

    print("Analisando Ruído Máximo...")
    res_n = analyzer._extract_ai_features(noise_path)
    print(f"Resultado Ruído: {res_n}")

    os.remove(silent_path)
    os.remove(noise_path)

if __name__ == "__main__":
    calibrate()
