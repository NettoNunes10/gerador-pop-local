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
        self.is_busy = False
        self.logs = []

    def global_cleanup(self):
        """Versão Otimizada: Remove arquivos fantasmas verificando pastas primeiro."""
        self.log("🚀 Iniciando faxina rápida da biblioteca...")
        try:
            cursor = db.conn.cursor()
            
            # 1. Pegar todas as categorias (pastas) únicas no banco
            cursor.execute("SELECT DISTINCT pasta_categoria FROM biblioteca")
            categories_in_db = [r[0] for r in cursor.fetchall()]
            
            # 2. Verificar quais categorias não existem mais no config ou no disco
            active_folders = {cat: folder for cat, folder in config.paths.items() if os.path.exists(folder)}
            
            for db_cat in categories_in_db:
                # Se a pasta da categoria não existe no disco, deleta tudo dela de uma vez
                if db_cat not in active_folders:
                    self.log(f"🗑️ Categoria '{db_cat}' não encontrada no disco. Removendo tudo...")
                    cursor.execute("DELETE FROM biblioteca WHERE pasta_categoria = ?", (db_cat,))
            
            db.conn.commit()

            # 3. Verificação de arquivos órfãos em pastas que EXISTEM (Abordagem de Conjunto)
            cursor.execute("SELECT id, caminho_arquivo FROM biblioteca")
            all_items = cursor.fetchall()
            
            ids_to_delete = []
            checked_folders = {} # Cache de pastas que já validamos
            
            for row_id, path in all_items:
                parent_dir = os.path.dirname(path)
                
                if parent_dir in checked_folders and not checked_folders[parent_dir]:
                    ids_to_delete.append(row_id)
                    continue
                
                if parent_dir not in checked_folders:
                    checked_folders[parent_dir] = os.path.exists(parent_dir)
                
                if not checked_folders[parent_dir]:
                    ids_to_delete.append(row_id)
                else:
                    if not os.path.exists(path):
                        ids_to_delete.append(row_id)

            if ids_to_delete:
                self.log(f"♻️ Removendo {len(ids_to_delete)} arquivos órfãos...")
                for i in range(0, len(ids_to_delete), 500):
                    batch = ids_to_delete[i:i+500]
                    cursor.execute(f"DELETE FROM biblioteca WHERE id IN ({','.join(['?']*len(batch))})", batch)
                db.conn.commit()
            
            self.log("✅ Faxina rápida concluída!")
        except Exception as e:
            self.log(f"❌ Erro na faxina: {e}")

    def sync_all(self):
        if self.is_busy: return
        self.is_busy = True
        self.logs = []
        
        try:
            self.log("📡 Iniciando Sincronização Geral da Biblioteca...")
            # 1. Limpeza total antes de começar
            self.global_cleanup()
            
            # 2. Sincroniza pastas configuradas (exceto sistema)
            system_folders = ['TEMPLATES', 'OUTPUT', 'LOGS', 'SAMPLES', 'DATABASE', 'MUSIC_ROOT']
            
            for category, folder in config.paths.items():
                cat_upper = category.upper()
                
                # Pula se for pasta de sistema ou o próprio ROOT (que é só uma referência)
                if cat_upper in system_folders:
                    continue
                
                if os.path.exists(folder):
                    # Pula análise pesada apenas para o que for explicitamente vinheta/comercial/sweep
                    is_plastic = any(x in cat_upper for x in ['VINHETAS', 'COMERCIAIS', 'PREFIXO', 'ENCERRAMENTO', 'VHT', 'PROMO', 'SWEEP', 'INTERCOM'])
                    self.sync_folder_to_db(folder, category, analyze=not is_plastic)
            
            self.log("✅ Sincronização concluída com sucesso!")
        except Exception as e:
            print(f"❌ Erro crítico no sync_all: {e}")
            self.log(f"❌ Erro crítico na sincronização: {e}")
        finally:
            self.is_busy = False

    def sync_folder_to_db(self, folder_path, category, analyze=True):
        cursor = db.conn.cursor()
        if not os.path.exists(folder_path): 
            cursor.execute("DELETE FROM biblioteca WHERE pasta_categoria = ?", (category,))
            db.conn.commit()
            return

        # 1. Limpeza: Remove do banco arquivos que não existem mais na pasta
        try:
            cursor.execute("SELECT id, caminho_arquivo FROM biblioteca WHERE pasta_categoria = ?", (category,))
            db_files = cursor.fetchall()
            ids_to_delete = [row[0] for row in db_files if not os.path.exists(row[1])]
            if ids_to_delete:
                db.conn.executemany("DELETE FROM biblioteca WHERE id = ?", [(i,) for i in ids_to_delete])
                db.conn.commit()
        except: pass

        # 2. Sincronização: Analisa novos arquivos
        try:
            files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.mp3', '.wav', '.flac'))]
            total = len(files)
            if total > 0:
                self.log(f"📡 Pasta '{category}': {total} arquivos encontrados.")

            import datetime as dt
            novos = []

            for index, f in enumerate(files):
                full_path = os.path.join(folder_path, f).replace('/', '\\')
                try:
                    cursor.execute("SELECT bpm, sub_categoria FROM biblioteca WHERE caminho_arquivo = ?", (full_path,))
                    row = cursor.fetchone()

                    # Só analisa se for novo ou sem BPM
                    if not row or row[0] == 0:
                        if analyze:
                            self.log(f"[{index+1}/{total}] Analisando: {f}...")
                            info = analyzer.analyze(full_path)
                            bpm = info['bpm']
                            title = info['titulo']
                            artista = info['artista']
                        else:
                            # Vinhetas/Comerciais: Sincronismo Instantâneo
                            bpm = 0
                            title = f
                            artista = category
                        
                        ctime = os.path.getctime(full_path)
                        data_arquivo = dt.datetime.fromtimestamp(ctime).isoformat()
                        subcat = row[1] if row else 'STD'
                        novos.append((full_path, artista, title, category, bpm, subcat, data_arquivo))

                        if len(novos) >= 20:
                            db.conn.executemany('''
                                INSERT INTO biblioteca (caminho_arquivo, artista, nome_musica, pasta_categoria, bpm, sub_categoria, data_arquivo)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(caminho_arquivo) DO UPDATE SET
                                    artista=excluded.artista, nome_musica=excluded.nome_musica,
                                    pasta_categoria=excluded.pasta_categoria, bpm=excluded.bpm,
                                    sub_categoria=excluded.sub_categoria,
                                    data_arquivo=COALESCE(data_arquivo, excluded.data_arquivo)
                            ''', novos)
                            db.conn.commit()
                            novos = []

                except Exception as e:
                    self.log(f"  [AVISO] Falha no arquivo '{f}': {e}")
                
                import time
                time.sleep(0.01) # Pausa mínima para fluidez

            if novos:
                db.conn.executemany('''
                    INSERT INTO biblioteca (caminho_arquivo, artista, nome_musica, pasta_categoria, bpm, sub_categoria, data_arquivo)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(caminho_arquivo) DO UPDATE SET
                        artista=excluded.artista, nome_musica=excluded.nome_musica,
                        pasta_categoria=excluded.pasta_categoria, bpm=excluded.bpm,
                        sub_categoria=excluded.sub_categoria,
                        data_arquivo=COALESCE(data_arquivo, excluded.data_arquivo)
                ''', novos)
                db.conn.commit()

        except Exception as e:
            self.log(f"Erro ao sincronizar pasta '{category}': {e}")

    def log(self, message):
        if self.log_callback:
            try: self.log_callback(message)
            except: pass
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.logs.append(f"[{ts}] {message}")
        if len(self.logs) > 100: self.logs.pop(0)
        try: print(f"[ENGINE] {message}")
        except: pass

    def get_audio_duration(self, filepath):
        try:
            audio = MutagenFile(filepath)
            if audio and audio.info:
                return int(round(audio.info.length * 1000))
        except: pass
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
        if not os.path.exists(model_path): return []
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
            if not candidates: candidates = [b for b in available_blocks if rule.is_in_range(b)]
            if candidates:
                chosen_block = random.choice(candidates)
                if chosen_block not in reservations: reservations[chosen_block] = []
                reservations[chosen_block].append(rule.filename)
                if chosen_block in free_blocks: free_blocks.remove(chosen_block)
        return reservations

    def select_music(self, folder_path, cat_string, current_hour):
        parts = cat_string.split(' ', 1)
        category = parts[0]
        subcategory = parts[1] if len(parts) > 1 else None
        music_root = config.get_path('MUSIC_ROOT')
        folder_path = os.path.join(music_root, category)

        for rule in config.surprise_rules:
            if rule['target'] == cat_string:
                if random.random() < rule['chance']:
                    return self.select_music("", rule['surprise'], current_hour)

        self.sync_folder_to_db(folder_path, category)
        candidate = db.get_best_candidate(category, current_hour, subcategory=subcategory, last_bpm=self.last_bpm)
        if candidate:
            full_path = candidate['caminho_arquivo']
            self.last_bpm = candidate['bpm'] or 0
            db.log_execution(full_path)
            return full_path, self.get_audio_duration(full_path)
        return None, 0

    def select_sweeper(self, category):
        folder = config.get_path('SWEEPERS')
        if 'Chamadas' in category: folder = config.get_path('PROMOS')
        elif 'Intercom' in category: folder = config.get_path('INTERCOM')
        elif 'Amostra' in category: folder = config.get_path('SAMPLES')
        try:
            files = [f for f in os.listdir(folder) if f.lower().endswith(('.mp3', '.wav'))]
            if not files: return None, 0
            choice = random.choice(files)
            if len(files) > 1:
                while choice == self.last_sweeper: choice = random.choice(files)
            self.last_sweeper = choice
            full = os.path.join(folder, choice).replace('/', '\\')
            return full, self.get_audio_duration(full)
        except: return None, 0

    def generate_schedule(self, date_str):
        target_date = datetime.datetime.strptime(date_str, '%Y%m%d')
        dow = target_date.weekday()
        model_file = config.day_templates.get(str(dow), 'SEMANAL.blm')
        model_path = os.path.join(config.get_path('TEMPLATES'), model_file)
        output_path = os.path.join(config.get_path('OUTPUT'), f"{date_str}.bil")
        valid_blocks = self.scan_model_blocks(model_path)
        if not valid_blocks: return False
        paid_reservations = {}
        if dow < 5: paid_reservations = self.schedule_paid_music(valid_blocks)
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
                        full_path = os.path.join(config.get_path('MUSIC_ROOT'), 'ESPECIAL', paid_song_file).replace('/', '\\')
                        dur = self.get_audio_duration(full_path)
                        db.log_execution(full_path)
                        final_lines.append(self.generate_bil_line(full_path, dur))
                    else:
                        path, dur = self.select_music(os.path.join(config.get_path('MUSIC_ROOT'), cat), cat, lookup_hour)
                        if path: final_lines.append(self.generate_bil_line(path, dur))
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='latin-1') as f:
            f.write('\n'.join(final_lines))
        return True
