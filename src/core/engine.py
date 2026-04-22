import os
import random
import datetime as dt
from .config import config
from .models import PaidInsertion
from .database import db
from .analyzer import analyzer
from .bpm_service import bpm_service

class PlaylistEngine:
    def __init__(self, log_callback=None):
        self.last_sweeper = ""
        self.last_bpm = 0
        self.log_callback = log_callback
        self.is_busy = False
        self.logs = []

    def log(self, message):
        timestamp = dt.datetime.now().strftime("%H:%M:%S")
        full_msg = f"[{timestamp}] {message}"
        self.logs.append(full_msg)
        if len(self.logs) > 500: self.logs.pop(0)
        if self.log_callback:
            self.log_callback(full_msg)
        print(f"[ENGINE] {message}")

    def global_cleanup(self):
        """Remove registros de arquivos que não existem mais ou de pastas de sistema."""
        cursor = db.conn.cursor()
        cursor.execute("SELECT id, caminho_arquivo FROM biblioteca")
        rows = cursor.fetchall()
        
        deleted_count = 0
        system_folders = ['Samples', 'Intercom', 'Templates', 'Settings']
        
        for row in rows:
            path = row[1]
            is_system = any(f"\\{folder}\\" in path.upper() or f"/{folder}/" in path.upper() for folder in system_folders)
            
            if is_system or not os.path.exists(path):
                cursor.execute("DELETE FROM biblioteca WHERE id = ?", (row[0],))
                deleted_count += 1
        
        db.conn.commit()
        if deleted_count > 0:
            self.log(f"🧹 Limpeza: {deleted_count} registros fantasmas ou de sistema removidos.")

    def sync_all(self):
        self.is_busy = True
        try:
            self.log("📡 Iniciando Sincronização Geral da Biblioteca...")
            self.global_cleanup()
            
            # Sincroniza todas as pastas de música no M:
            music_root = config.get_path('MUSIC_ROOT')
            if os.path.exists(music_root):
                subdirs = [d for d in os.listdir(music_root) if os.path.isdir(os.path.join(music_root, d))]
                self.log(f"🔎 Buscando músicas em: {music_root}")
                
                system_folders = ['SAMPLES', 'INTERCOM', 'TEMPLATES', 'SETTINGS', '$RECYCLE.BIN', 'SYSTEM VOLUME INFORMATION']
                
                for folder in subdirs:
                    if folder.upper() not in system_folders:
                        self.sync_folder_to_db(os.path.join(music_root, folder), folder.upper(), analyze=True)
            
            # Sincroniza Vinhetas e Comerciais (Sem análise de áudio para ser rápido)
            sweeper_root = config.get_path('SWEEPER_ROOT')
            if os.path.exists(sweeper_root):
                self.sync_folder_to_db(sweeper_root, 'VINHETA', analyze=False)
                
            commercial_root = config.get_path('COMMERCIAL_ROOT')
            if os.path.exists(commercial_root):
                self.sync_folder_to_db(commercial_root, 'COMERCIAL', analyze=False)

            self.log("✅ Sincronização geral concluída!")
        finally:
            self.is_busy = False

    def sync_folder_to_db(self, folder_path, category, analyze=True):
        if not os.path.exists(folder_path): return
        
        files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.mp3', '.wav', '.flac', '.m4a'))]
        total = len(files)
        if total > 0:
            self.log(f"📡 Pasta '{category}': {total} arquivos encontrados.")
        
        cursor = db.conn.cursor()
        for index, f in enumerate(files):
            full_path = os.path.join(folder_path, f).replace('/', '\\')
            try:
                cursor.execute("SELECT bpm, sub_categoria FROM biblioteca WHERE caminho_arquivo = ?", (full_path,))
                row = cursor.fetchone()

                # Só analisa se for novo ou sem BPM (BPM=0)
                if not row or (analyze and row[0] == 0):
                    if analyze:
                        self.log(f"[{index+1}/{total}] Analisando: {f}...")
                        artists_list, title = self.parse_artist_title(f)
                        artista = ", ".join(artists_list)
                        
                        # 1. Tenta Deezer
                        bpm = bpm_service.get_bpm_from_deezer(artists_list[0], title)
                        
                        # 2. Fallback Local
                        if not bpm or bpm == 0:
                            bpm = bpm_service.get_bpm_locally(full_path)
                        
                        if bpm:
                            self.log(f"🥁 BPM definido: {bpm}")
                        
                        duracao = self.get_audio_duration(full_path)
                    else:
                        artista = category
                        title = f
                        bpm = 0
                        duracao = self.get_audio_duration(full_path)
                    
                    ctime = os.path.getctime(full_path)
                    data_arquivo = dt.datetime.fromtimestamp(ctime).isoformat()
                    subcat = row[1] if row else 'STD'
                    
                    db.insert_music(
                        nome_musica=title,
                        artista=artista,
                        caminho_arquivo=full_path,
                        pasta_categoria=category,
                        bpm=bpm,
                        duracao=duracao,
                        sub_categoria=subcat,
                        data_arquivo=data_arquivo
                    )
            except Exception as e:
                self.log(f"  [AVISO] Falha no arquivo '{f}': {e}")

    def parse_artist_title(self, filename):
        """Extrai Artista e Título do nome do arquivo."""
        name_without_ext = os.path.splitext(filename)[0]
        if ' - ' in name_without_ext:
            parts = name_without_ext.split(' - ', 1)
            artist_part = parts[0].strip()
            title = parts[1].strip()
            artists = [a.strip() for a in artist_part.replace(' e ', ' & ').split('&')]
            return artists, title
        return ["DESCONHECIDO"], name_without_ext

    def get_audio_duration(self, filepath):
        try:
            from mutagen.mp3 import MP3
            from mutagen.wave import WAVE
            from mutagen.flac import FLAC
            ext = os.path.splitext(filepath)[1].lower()
            if ext == '.mp3': return int(MP3(filepath).info.length)
            if ext == '.wav': return int(WAVE(filepath).info.length)
            if ext == '.flac': return int(FLAC(filepath).info.length)
        except: pass
        return 0

    def generate_schedule(self, date_str):
        self.is_busy = True
        try:
            # Lógica de geração de roteiro (simplificada para o exemplo)
            self.log(f"Gerando roteiro para {date_str}...")
            # Aqui entraria a chamada para carregar o template .blm e preencher
            # Por enquanto, mantemos a estrutura de logs
        finally:
            self.is_busy = False

    def select_music(self, folder_path, category, current_hour, subcategory=None):
        """Seleciona a melhor música baseado no ritmo (BPM) e descanso."""
        # Lógica de Surpresa (Wildcards)
        if category in config.surprise_rules:
            rule = config.surprise_rules[category]
            if random.random() < rule['chance']:
                self.log(f"🎲 SURPRESA: Ativando wildcard de {category} para {rule['surprise']}!")
                return self.select_music("", rule['surprise'], current_hour)

        candidate = db.get_best_candidate(category, current_hour, subcategory=subcategory, last_bpm=self.last_bpm)
        if candidate:
            full_path = candidate['caminho_arquivo']
            self.last_bpm = candidate['bpm'] or 0
            db.log_execution(full_path)
            return full_path, self.get_audio_duration(full_path)
        return None, 0
