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

    def get_audio_duration(self, filepath):
            from mutagen import File as MutagenFile
            audio = MutagenFile(filepath)
            if audio and audio.info:
                return int(round(audio.info.length * 1000))
        except:
            pass
        return 3000

    def generate_schedule(self, date_str):
        self.is_busy = True
        try:
            # 1. Configurações Iniciais
            date_obj = dt.datetime.strptime(date_str, "%Y%m%d")
            weekday = date_obj.weekday()
            
            # Escolhe o modelo baseado no dia (Seg-Sex: SEMANAL, Sab: SABADO, Dom: DOMINGO)
            template_name = "SEMANAL.blm"
            if weekday == 5: template_name = "SABADO.blm"
            elif weekday == 6: template_name = "DOMINGO.blm"
            
            # Sobrescreve se houver algo específico no day_templates do config
            template_name = config.day_templates.get(str(weekday), template_name)

            template_path = os.path.join(config.get_path('TEMPLATES'), template_name)
            output_path = os.path.join(config.get_path('OUTPUT'), f"{date_str}.bil")

            if not os.path.exists(template_path):
                self.log(f"❌ Erro: Modelo não encontrado: {template_path}")
                return

            # 2. Escaneia blocos para agendamento de pagas
            valid_blocks = []
            with open(template_path, 'r', encoding='latin-1') as f:
                for line in f:
                    line = line.strip()
                    if len(line) >= 5 and line[2] == ':' and line[0].isdigit():
                        valid_blocks.append(line.split()[0])

            # Agendamento de músicas pagas (Apenas dias de semana)
            paid_reservations = {}
            if weekday < 5:
                self.log("📅 Agendando músicas pagas...")
                for rule in config.paid_rules:
                    # rule é um dict: {"filename": "...", "start": "HH:MM", "end": "HH:MM"}
                    start_t = dt.datetime.strptime(rule['start'], "%H:%M").time()
                    end_t = dt.datetime.strptime(rule['end'], "%H:%M").time()
                    
                    candidates = []
                    for b in valid_blocks:
                        b_t = dt.datetime.strptime(b, "%H:%M").time()
                        if start_t <= b_t < end_t: candidates.append(b)
                    
                    if candidates:
                        chosen = random.choice(candidates)
                        if chosen not in paid_reservations: paid_reservations[chosen] = []
                        paid_reservations[chosen].append(rule['filename'])

            # 3. Processamento do Roteiro
            self.log(f"📝 Gerando: {template_name} -> {date_str}.bil")
            with open(template_path, 'r', encoding='latin-1') as f_in:
                lines = f_in.readlines()

            final_lines = ["# Arquivo de roteiro da beAudio\t1\t550470001"]
            current_block_time = "00:00"
            pending_paid = []

            for line in lines:
                raw_line = line.strip()
                if not raw_line or raw_line.startswith("#"): continue

                # CABEÇALHO DE BLOCO (00:00 ...)
                if raw_line[0].isdigit() and ':' in raw_line and len(raw_line.split()[0]) == 5:
                    current_block_time = raw_line.split()[0]
                    final_lines.append(raw_line)
                    pending_paid = paid_reservations.get(current_block_time, [])[:]
                    continue

                # COMERCIAIS
                if 'Reserva' in raw_line or 'Início' in raw_line:
                    final_lines.append("Início do bloco comercial /m:0 /t:0 /i:0 /s:0 /f:0 /r:0 /d:0 /o:3 /n:1 /x: /g:0")
                    final_lines.append("Término do bloco comercial /m:0 /t:0 /i:0 /s:0 /f:0 /r:0 /d:0 /o:4 /n:1 /x: /g:0")
                    continue

                # FIXOS
                if 'PREFIXO' in raw_line or raw_line.startswith('U:\\'):
                    final_lines.append(raw_line)
                    continue

                # PROCESSAMENTO DE CATEGORIAS (.apm)
                if ".apm" in raw_line.lower():
                    cat_part = raw_line.split(" ", 1)[0]
                    cat = cat_part.upper().replace(".APM", "")
                    
                    # Se tiver música paga pendente para este slot
                    if pending_paid and not any(x in cat for x in ['VHT', 'CHAMADA', 'INTERCOM']):
                        paid_file = pending_paid.pop(0)
                        full_path = os.path.join(config.get_path('MUSIC_ROOT'), 'ESPECIAL', paid_file).replace('/', '\\')
                        dur = self.get_audio_duration(full_path)
                        final_lines.append(f"{full_path} /m:3000 /t:{dur} /i:0 /s:0 /f:{dur} /r:0 /d:0 /o:0 /n:1 /x:  /g:0")
                        continue

                    # Regra de Surpresa
                    if cat == 'SERTANEJO B' and random.random() < 0.005:
                        cat = 'SERTANEJO C'

                    # Seleção inteligente (BPM + Histórico)
                    file_path, duration, tid = self.select_music("", cat, int(current_block_time[:2]))
                    
                    if file_path:
                        # CARIMBA A EXECUÇÃO NO BANCO!
                        exec_time = f"{date_str} {current_block_time}:00"
                        db.update_last_played(tid, exec_time)
                        
                        # Se for vinheta ou intercom, usamos parâmetros diferentes ou duração zero
                        is_special = any(x in cat for x in ['VHT', 'CHAMADA', 'INTERCOM', 'AMOSTRA'])
                        m_val = "0" if is_special else "3000"
                        final_lines.append(f"{file_path} /m:{m_val} /t:{duration} /i:0 /s:0 /f:{duration} /r:0 /d:0 /o:0 /n:1 /x:  /g:0")
                    else:
                        final_lines.append(raw_line)
                else:
                    final_lines.append(raw_line)

            import unicodedata
            with open(output_path, 'w', encoding='latin-1', errors='replace') as f_out:
                normalized_content = unicodedata.normalize('NFC', "\n".join(final_lines))
                f_out.write(normalized_content)
            
            self.log(f"✅ Roteiro gerado com sucesso: {output_path}")

        except Exception as e:
            self.log(f"❌ Erro na geração: {str(e)}")
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
