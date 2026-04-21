import os
import random
import datetime
from mutagen import File as MutagenFile
from .config import config
from .models import PaidInsertion
from .database import db
from .analyzer import analyzer

class PlaylistEngine:
    def __init__(self, log_callback=None):
        self.last_sweeper = ""
        self.last_bpm = 0
        self.log_callback = log_callback

    def log(self, message):
        if self.log_callback:
            try:
                self.log_callback(message)
            except:
                pass
        
        # Tenta imprimir normal, se falhar (por causa de acentos), limpa a string
        try:
            print(f"[ENGINE] {message}")
        except UnicodeEncodeError:
            # Sanitização simples para o console do Windows
            import unicodedata
            msg_clean = unicodedata.normalize('NFKD', message).encode('ascii', 'ignore').decode('ascii')
            print(f"[ENGINE] {msg_clean} (Nome sanitizado para exibição)")

    def get_audio_duration(self, filepath):
        try:
            audio = MutagenFile(filepath)
            if audio and audio.info:
                return int(round(audio.info.length * 1000))
        except:
            pass
        return 3000

    def parse_artist_title(self, filename):
        clean = os.path.splitext(filename)[0]
        if ' - ' in clean:
            parts = clean.split(' - ')
            artists = [p.strip() for p in parts[0].split(' PART. ')]
            return artists, parts[1]
        return [clean], clean

    def generate_bil_line(self, filepath, duration):
        return f"{filepath} /m:3000 /t:{duration} /i:0 /s:0 /f:{duration} /r:0 /d:0 /o:0 /n:1 /x:  /g:0"

    def scan_model_blocks(self, model_path):
        valid_blocks = []
        if not os.path.exists(model_path):
            self.log(f"⚠️ Template não encontrado: {model_path}")
            return []
        
        with open(model_path, 'r', encoding='latin-1') as f:
            for line in f:
                line = line.strip()
                if len(line) >= 5 and line[2] == ':' and line[0].isdigit():
                    time_str = line.split()[0]
                    if time_str == "24:00": time_str = "00:00"
                    valid_blocks.append(time_str)
        return valid_blocks

    def schedule_paid_music(self, available_blocks):
        reservations = {}
        free_blocks = available_blocks.copy()
        
        paid_rules = [PaidInsertion(r['filename'], r['start'], r['end']) for r in config.paid_rules]

        for rule in paid_rules:
            candidates = [b for b in free_blocks if rule.is_in_range(b)]
            if not candidates:
                candidates = [b for b in available_blocks if rule.is_in_range(b)]

            if candidates:
                chosen_block = random.choice(candidates)
                if chosen_block not in reservations:
                    reservations[chosen_block] = []
                reservations[chosen_block].append(rule.filename)

                if chosen_block in free_blocks:
                    free_blocks.remove(chosen_block)
                self.log(f"📅 Agendado: {rule.filename} para o bloco das {chosen_block}")
        return reservations

    def sync_folder_to_db(self, folder_path, category):
        try:
            if not os.path.exists(folder_path): return

            # 1. Limpeza: Remove do banco arquivos que não existem mais na pasta
            cursor = db.conn.cursor()
            cursor.execute("SELECT id, caminho_arquivo FROM biblioteca WHERE pasta_categoria = ?", (category,))
            db_files = cursor.fetchall()
            for row in db_files:
                if not os.path.exists(row[1]):
                    db.conn.execute("DELETE FROM biblioteca WHERE id = ?", (row[0],))
            db.conn.commit()

            # 2. Sincronização: Adiciona novos arquivos
            files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.mp3', '.wav', '.flac'))]
            total = len(files)
            if total > 0:
                self.log(f"Pasta '{category}': {total} arquivos encontrados.")
            
            for index, f in enumerate(files):
                full_path = os.path.join(folder_path, f).replace('/', '\\')
                
                cursor.execute("SELECT bpm, sub_categoria FROM biblioteca WHERE caminho_arquivo = ?", (full_path,))
                row = cursor.fetchone()
                
                # Se não existe ou não tem BPM, analisa
                if not row or row[0] == 0:
                    self.log(f"[{index+1}/{total}] Analisando: {f}...")
                    artists, title = self.parse_artist_title(f)
                    bpm = analyzer.get_bpm(full_path)
                    
                    # Se for novo (não tem row), usa 'MED' como padrão
                    subcat = row[1] if row else 'MED'
                    db.add_to_library(full_path, ", ".join(artists), title, category, bpm, subcat)
        except Exception as e:
            self.log(f"Erro ao sincronizar pasta {category}: {str(e)}")

    def select_music(self, folder_path, cat_string, current_hour):
        # Lógica de decomposição: 'SERTANEJO TOP' -> category='SERTANEJO', sub='TOP'
        parts = cat_string.split(' ', 1)
        category = parts[0]
        subcategory = parts[1] if len(parts) > 1 else None

        # Re-ajusta folder_path baseado na categoria principal
        music_root = config.get_path('MUSIC_ROOT')
        folder_path = os.path.join(music_root, category)

        # Lógica de Surpresa (Wildcard Idea 1) baseada na string completa
        for rule in config.surprise_rules:
            if rule['target'] == cat_string:
                if random.random() < rule['chance']:
                    self.log(f"🎲 SURPRESA: Trocando '{cat_string}' por '{rule['surprise']}'")
                    # Recursivo com a nova string
                    return self.select_music("", rule['surprise'], current_hour)

        # Sincronização rápida (pela pasta principal)
        self.sync_folder_to_db(folder_path, category)
        
        # Busca o melhor candidato no banco (Ranking de Score + Subcategoria)
        candidate = db.get_best_candidate(category, current_hour, subcategory=subcategory, last_bpm=self.last_bpm)
        
        if candidate:
            full_path = candidate['caminho_arquivo']
            self.last_bpm = candidate['bpm'] or 0
            # Registrar execução no DB
            db.log_execution(full_path)
            return full_path, self.get_audio_duration(full_path)
            
        return None, 0

    def select_sweeper(self, category):
        folder = config.get_path('SWEEPERS')
        if 'Chamadas' in category:
            folder = config.get_path('PROMOS')
        elif 'Intercom' in category:
            folder = config.get_path('INTERCOM')
        elif 'Amostra' in category:
            folder = config.get_path('SAMPLES')

        try:
            files = [f for f in os.listdir(folder) if f.lower().endswith(('.mp3', '.wav'))]
            if not files: return None, 0

            # Simplificado: para vinhetas ainda usamos random por enquanto, 
            # mas o usuário pediu para expandir. 
            # TO-DO: Mover vinhetas também para o sistema de Score do banco.
            choice = random.choice(files)
            if len(files) > 1:
                while choice == self.last_sweeper: choice = random.choice(files)
            self.last_sweeper = choice

            full = os.path.join(folder, choice).replace('/', '\\')
            return full, self.get_audio_duration(full)
        except:
            return None, 0

    def generate_schedule(self, date_str):
        target_date = datetime.datetime.strptime(date_str, '%Y%m%d')
        dow = target_date.weekday()

        # Busca o modelo mapeado para este dia da semana
        model_file = config.day_templates.get(str(dow), 'SEMANAL.blm')

        model_path = os.path.join(config.get_path('TEMPLATES'), model_file)
        output_path = os.path.join(config.get_path('OUTPUT'), f"{date_str}.bil")

        valid_blocks = self.scan_model_blocks(model_path)
        if not valid_blocks:
            self.log(f"❌ Abortando geração para {date_str}: Nenhum bloco encontrado no template.")
            return False

        paid_reservations = {}
        if dow < 5:
            paid_reservations = self.schedule_paid_music(valid_blocks)
        else:
            self.log("🚫 Fim de Semana detectado: Nenhuma música paga será inserida.")

        final_lines = ["# Arquivo de roteiro da beAudio\t1\t550470001"]
        current_block_time = "00:00"
        pending_paid_songs = []

        with open(model_path, 'r', encoding='latin-1') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue

                if line[0].isdigit() and ':' in line and len(line.split()[0]) == 5:
                    current_block_time = line.split()[0]
                    lookup_hour = int(current_block_time.split(':')[0])
                    final_lines.append(line)
                    if current_block_time in paid_reservations:
                        pending_paid_songs = paid_reservations[current_block_time][:]
                    continue

                if 'Reserva' in line or 'Início' in line:
                    final_lines.append("Início do bloco comercial /m:0 /t:0 /i:0 /s:0 /f:0 /r:0 /d:0 /o:3 /n:1 /x: /g:0")
                    final_lines.append("Término do bloco comercial /m:0 /t:0 /i:0 /s:0 /f:0 /r:0 /d:0 /o:4 /n:1 /x: /g:0")
                    continue

                if 'PREFIXO' in line or line.startswith('U:\\'):
                    final_lines.append(line)
                    continue

                cat = line.split('.apm')[0]
                is_sweeper = any(x in cat for x in ['VHT', 'Chamada', 'Intercom', 'Amostra'])

                if is_sweeper:
                    path, dur = self.select_sweeper(cat)
                    if path: final_lines.append(self.generate_bil_line(path, dur))
                else:
                    if pending_paid_songs:
                        paid_song_file = pending_paid_songs.pop(0)
                        self.log(f"[{current_block_time}] ♻️ SUBSTITUIÇÃO: '{cat}' -> {paid_song_file}")
                        full_path = os.path.join(config.get_path('MUSIC_ROOT'), 'ESPECIAL', paid_song_file).replace('/', '\\')
                        dur = self.get_audio_duration(full_path)
                        db.log_execution(full_path) # Registrar paga também
                        final_lines.append(self.generate_bil_line(full_path, dur))
                    else:
                        path, dur = self.select_music(os.path.join(config.get_path('MUSIC_ROOT'), cat), cat, lookup_hour)
                        if path:
                            final_lines.append(self.generate_bil_line(path, dur))

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='latin-1') as f:
            f.write('\n'.join(final_lines))
        self.log(f"✅ Playlist gerada: {output_path}")
        return True
