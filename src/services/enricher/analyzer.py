import os
import subprocess
import tempfile
import json
import numpy as np

# Tentamos importar as bibliotecas de IA
try:
    import tensorflow as tf
    import librosa
    HAS_AI = True
except ImportError:
    HAS_AI = False

class MusicAnalyzer:
    def __init__(self, models_path="models"):
        self.base_path = os.path.dirname(os.path.abspath(__file__))
        self.extractor_path = os.path.join(self.base_path, "essentia_streaming_extractor_music.exe")
        self.profile_path = os.path.join(self.base_path, "profile.yaml")
        self.models_path = os.path.join(self.base_path, models_path)
        
        # Modelos para Humor Inteligente
        self.model_musicnn = os.path.join(self.models_path, "msd-musicnn-1.pb")
        self.model_deam = os.path.join(self.models_path, "deam-msd-musicnn-2.pb")
        
        self.ai_ready = False
        if HAS_AI and os.path.exists(self.model_musicnn) and os.path.exists(self.model_deam):
            self._init_tf()

    def _init_tf(self):
        """Carrega os modelos TensorFlow para predição de humor."""
        try:
            # Desativa logs chatos do TF
            os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
            
            # Carrega MusiCNN (Extrator de Características)
            with tf.io.gfile.GFile(self.model_musicnn, "rb") as f:
                graph_def = tf.compat.v1.GraphDef()
                graph_def.ParseFromString(f.read())
            self.graph_musicnn = tf.Graph()
            with self.graph_musicnn.as_default():
                tf.import_graph_def(graph_def, name="")
            self.sess_musicnn = tf.compat.v1.Session(graph=self.graph_musicnn)
            
            # Carrega DEAM (Preditor de Valence/Arousal)
            with tf.io.gfile.GFile(self.model_deam, "rb") as f:
                graph_def_deam = tf.compat.v1.GraphDef()
                graph_def_deam.ParseFromString(f.read())
            self.graph_deam = tf.Graph()
            with self.graph_deam.as_default():
                tf.import_graph_def(graph_def_deam, name="")
            self.sess_deam = tf.compat.v1.Session(graph=self.graph_deam)
            
            self.ai_ready = True
            print("🧠 IA: Modelos carregados e prontos para análise emocional.")
        except Exception as e:
            print(f"❌ Erro ao carregar IA: {e}")

    def _get_duration(self, filepath):
        try:
            cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filepath]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return float(result.stdout.strip())
        except:
            return 180.0

    def _extract_ai_features(self, audio_path):
        """Usa os modelos MusiCNN e DEAM com a especificação CANÔNICA (Fix by Claude)."""
        if not self.ai_ready: return 50, 50, 5.0, 5.0
        try:
            # 1. Carrega o áudio completo em 16kHz (SEM normalização prévia)
            y, sr = librosa.load(audio_path, sr=16000, mono=True)

            # 2. Mel Spectrogram com parâmetros EXATOS do MusiCNN
            mel = librosa.feature.melspectrogram(
                y=y, sr=16000,
                n_fft=512,        # Hanning window 32ms @ 16kHz
                hop_length=256,   # 50% overlap
                n_mels=96,        # Número de bandas mel
                power=2.0         # Espectrograma de POTÊNCIA (Crucial!)
            ).T
            
            # 3. Log-Compression CANÔNICA
            mel = np.log10(10000 * mel + 1)
            
            # 4. Fatiamento em patches de 187 frames (~3 segundos)
            patch_size = 187
            valences, energies = [], []
            
            in_m = self.graph_musicnn.get_tensor_by_name("model/Placeholder:0")
            out_m = self.graph_musicnn.get_tensor_by_name("model/dense/BiasAdd:0") # Layer de Embedding correto
            in_d = self.graph_deam.get_tensor_by_name("model/Placeholder:0")
            out_d = self.graph_deam.get_tensor_by_name("model/Identity:0")

            for i in range(0, mel.shape[0] - patch_size + 1, patch_size):
                chunk = mel[i:i+patch_size, :][np.newaxis, :, :] 
                emb = self.sess_musicnn.run(out_m, feed_dict={in_m: chunk})
                pred = self.sess_deam.run(out_d, feed_dict={in_d: emb})
                valences.append(pred[0][0])
                energies.append(pred[0][1])

            # Mapeamento Final (Dataset DEAM original usa escala 1-9)
            v_avg = float(np.mean(valences)) if valences else 5.0
            e_avg = float(np.mean(energies)) if energies else 5.0
            
            print(f"DEBUG (Escala DEAM 1-9) -> Valence: {round(v_avg, 3)} | Energy: {round(e_avg, 3)}")

            # Mapeamento 1-9 -> 0-100 (Com correção matemática do int)
            valence = int( (((v_avg - 1.0) / 8.0) * 100) )
            energy = int( (((e_avg - 1.0) / 8.0) * 100) )
            
            valence = min(100, max(0, valence))
            energy = min(100, max(0, energy))
            
            return valence, energy, v_avg, e_avg
        except Exception as e:
            print(f"⚠️ Erro na IA: {e}")
            return 50, 50, 5.0, 5.0

    def analyze(self, filepath):
        if not os.path.exists(filepath): raise FileNotFoundError(filepath)
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_audio:
            trimmed_audio = tmp_audio.name
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp_json:
            output_json = tmp_json.name

        try:
            # 1. Conversão do áudio completo para WAV
            subprocess.run(['ffmpeg', '-y', '-i', filepath, '-ar', '44100', '-ac', '2', trimmed_audio], capture_output=True, check=True)

            # 2. BPM via Executável (Essentia)
            command = [self.extractor_path, os.path.abspath(trimmed_audio), os.path.abspath(output_json), os.path.abspath(self.profile_path)]
            subprocess.run(command, capture_output=True, text=True, cwd=self.base_path)
            
            bpm = 0
            if os.path.exists(output_json):
                with open(output_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                bpm_raw = data.get('rhythm', {}).get('bpm', 0)
                
            # 3. HUMOR via IA (TensorFlow)
            valence, energy, v_avg, e_avg = self._extract_ai_features(trimmed_audio)
            
            # NOVO MOOD LINEAR (Média entre Valence e Energy) - V2 (0-100)
            mood_id = int((valence + energy) / 2)

            # LÓGICA REFINADA DE CORREÇÃO DE OITAVA (BPM)
            # Para o perfil de músicas do sistema (Pop/Sertanejo), BPMs acima de 150 
            # são quase sempre o dobro do real (Ex: 160 -> 80).
            if bpm_raw > 150:
                bpm = round(bpm_raw / 2, 2)
            elif bpm_raw > 128 and energy < 68:
                # Músicas entre 128 e 150 com energia moderada/baixa
                # geralmente são músicas de 64-75 BPM medidas no dobro.
                bpm = round(bpm_raw / 2, 2)
            else:
                bpm = round(bpm_raw, 2)

            return {
                "file": os.path.basename(filepath),
                "bpm": bpm,
                "energy": energy,
                "valence": valence, # Agora salvo em escala 0-100
                "vibe": mood_id,
                "raw_ai_values": {
                    "valence": round(v_avg, 3),
                    "energy": round(e_avg, 3)
                },
                "status": "ai-hybrid-v2"
            }

        except Exception as e:
            return {"error": f"Erro interno: {str(e)}"}
        finally:
            for f in [output_json, trimmed_audio]:
                if os.path.exists(f): os.remove(f)
