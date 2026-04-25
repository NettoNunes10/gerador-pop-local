import os
import random
import datetime as dt
from .config import AUDIO_EXTENSIONS, config
from .models import PaidInsertion
from .database import db
from .enricher import MusicEnricher
from ..blm_manager import BLMService


class PlaylistEngine:
    def __init__(self, log_callback=None):
        self.last_sweeper = ""
        self.last_bpm = 0
        self.log_callback = log_callback
        self.is_busy = False
        self.logs = []
        self.enricher = None # Será inicializado sob demanda ou no sync

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
            
            # Inicializa a IA apenas uma vez se necessário
            if not self.enricher:
                self.enricher = MusicEnricher()
                
            self.global_cleanup()
            
            # Sincroniza apenas pastas de música no M:
            music_root = config.get_path('MUSIC_ROOT')
            if os.path.exists(music_root):
                subdirs = [d for d in os.listdir(music_root) if os.path.isdir(os.path.join(music_root, d))]
                self.log(f"🔎 Buscando músicas em: {music_root}")
                
                system_folders = ['SAMPLES', 'INTERCOM', 'TEMPLATES', 'SETTINGS', '$RECYCLE.BIN', 'SYSTEM VOLUME INFORMATION', 'VHT - GERAÇÃO', 'VHT']
                
                for folder in subdirs:
                    if folder.upper() not in system_folders:
                        self.sync_folder_to_db(os.path.join(music_root, folder), folder.upper(), analyze=True)
            
            # Após o sync de arquivos, varre o banco para enriquecer o que ficou pendente
            self.enrich_missing_data()
            
            self.log("✅ Sincronização de músicas concluída!")
        finally:
            self.is_busy = False

    def sync_folder_to_db(self, folder_path, category, analyze=True):
        if not os.path.exists(folder_path): return
        
        files = [f for f in os.listdir(folder_path) if f.lower().endswith(AUDIO_EXTENSIONS)]
        total = len(files)
        if total > 0:
            self.log(f"📡 Pasta '{category}': {total} arquivos encontrados.")
        
        cursor = db.conn.cursor()
        for index, f in enumerate(files):
            full_path = os.path.join(folder_path, f).replace('/', '\\')
            try:
                cursor.execute("SELECT id, bpm, energy, valence, vibe, duracao FROM biblioteca WHERE caminho_arquivo = ?", (full_path,))
                row = cursor.fetchone()

                # Processa se for novo OU se faltar dados de IA
                if not row:
                    self.log(f"[{index+1}/{total}] Novo arquivo: {f}")
                    artists_list, title = self.parse_artist_title(f)
                    artista = ", ".join(artists_list)
                    duracao = self.get_audio_duration(full_path)
                    
                    ctime = os.path.getctime(full_path)
                    data_arquivo = dt.datetime.fromtimestamp(ctime).isoformat()
                    
                    # Chamada DIRETA para a nossa IA de enriquecimento
                    enrich_data = self.trigger_enrichment(full_path)
                    
                    # Se a IA retornou dados, usamos; caso contrário, usamos NULL
                    bpm = enrich_data.get('bpm') if enrich_data else None
                    energy = enrich_data.get('energy') if enrich_data else None
                    valence = enrich_data.get('valence') if enrich_data else None
                    vibe = enrich_data.get('vibe') if enrich_data else None

                    if enrich_data and 'error' not in enrich_data:
                        self.log(f"  ✨ IA: {bpm} BPM | Vibe: {vibe} | Energia: {energy}% | Valence: {valence}%")
                    elif enrich_data and 'error' in enrich_data:
                        self.log(f"  ⚠️ IA Erro: {enrich_data['error']}")

                    # Insere no banco com todos os dados de inteligência
                    db.insert_music(
                        nome_musica=title,
                        artista=artista,
                        caminho_arquivo=full_path,
                        pasta_categoria=category,
                        bpm=bpm, 
                        duracao=duracao,
                        energy=energy,
                        valence=valence,
                        vibe=vibe,
                        sub_categoria='STD',
                        data_arquivo=data_arquivo
                    )
                else:
                    # Se o arquivo já existe, checamos se ele tem dados de IA completos
                    tid, bpm, energy, valence, vibe, duracao = row
                    if not duracao or duracao <= 3:
                        new_duration = self.get_audio_duration(full_path)
                        if new_duration > 3:
                            cursor.execute("UPDATE biblioteca SET duracao = ? WHERE id = ?", (new_duration, tid))
                            db.conn.commit()
                            self.log(f"[{index+1}/{total}] Duracao atualizada: {f} -> {new_duration}s")

                    if any(v in (None, 0) for v in (bpm, energy, valence, vibe)):
                        self.log(f"[{index+1}/{total}] Completando dados de IA: {f}")
                        success, result = self.enricher.enrich_track(tid)
                        if success:
                            self.log(f"  ✨ IA: {result['bpm']} BPM | Vibe: {result['vibe']} | Energia: {result['energy']}% | Valence: {result['valence']}%")
                        else:
                            self.log(f"  ⚠️ Falha: {result}")





            except Exception as e:
                self.log(f"  [AVISO] Falha no arquivo '{f}': {e}")

    def parse_artist_title(self, filename):
        """Extrai Artista e Título do nome do arquivo."""
        name_without_ext = os.path.splitext(filename)[0]
        if ' - ' in name_without_ext:
            parts = name_without_ext.split(' - ', 1)
            artist_part = parts[0].strip()
            title = parts[1].strip()
            
            # Normaliza separadores de artistas
            import re
            # Substitui ' PART. ', ' FT. ', ' FEAT. ' por vírgula para split
            artist_part = re.sub(r' (PART\.|FT\.|FEAT\.) ', ', ', artist_part, flags=re.IGNORECASE)
            artists = [a.strip().upper() for a in artist_part.split(',')]
            
            return artists, title
        return ["DESCONHECIDO"], name_without_ext

    def trigger_enrichment(self, filepath):
        """Usa o MusicEnricher interno (IA persistente) para analisar a música."""
        if not self.enricher:
            self.enricher = MusicEnricher()
        return self.enricher.analyze_path(filepath)

    def enrich_missing_data(self):
        """Varre o banco em busca de músicas que ainda não foram analisadas pela API."""
        self.log("🔍 Buscando músicas sem dados de inteligência...")
        cursor = db.conn.cursor()
        # Busca músicas onde os campos de inteligência estão zerados ou nulos
        cursor.execute("""
            SELECT id, caminho_arquivo, artista, nome_musica 
            FROM biblioteca 
            WHERE (bpm IS NULL OR bpm = 0 OR energy IS NULL OR energy = 0 OR valence IS NULL OR valence = 0 OR vibe IS NULL OR vibe = 0)
            LIMIT 200
        """)
        rows = cursor.fetchall()
        
        if not rows:
            self.log("✨ Todas as músicas já possuem dados de inteligência.")
            return

        self.log(f"🚀 Enriquecendo {len(rows)} músicas pendentes...")
        for row in rows:
            tid, path, art, title = row
            self.log(f"🧠 Analisando: {art} - {title}")
            
            # Usa o enriquecedor interno persistente
            success, result = self.enricher.enrich_track(tid)
            if success:
                self.log(f"  ✨ Resumo: {result['bpm']} BPM | Vibe: {result['vibe']} | Energia: {result['energy']}% | Valence: {result['valence']}%")
            else:
                self.log(f"  [AVISO] Falha ao analisar {title}: {result}")
        
        self.log("✅ Enriquecimento de pendentes finalizado.")

    def get_audio_duration(self, filepath):
        try:
            from mutagen import File as MutagenFile
            audio = MutagenFile(filepath)
            if audio and audio.info:
                return int(round(audio.info.length))
        except:
            pass
        return 0

    def duration_seconds_to_bil_ms(self, duration_seconds):
        try:
            seconds = float(duration_seconds or 0)
        except (TypeError, ValueError):
            seconds = 0
        if seconds <= 0:
            seconds = 3
        return int(round(seconds * 1000))

    def make_bil_line(self, filepath, duration, mix="3000"):
        duration_ms = self.duration_seconds_to_bil_ms(duration)
        return f"{filepath} /m:{mix} /t:{duration_ms} /i:0 /s:0 /f:{duration_ms} /r:0 /d:0 /o:0 /n:1 /x:  /g:0"

    def make_block_marker_line(self, time_str):
        return f"{time_str} /m:0 /t:0 /i:0 /s:0 /f:0 /r:0 /d:0 /o:0 /n:1 /x:  /g:0"

    def get_desktop_dir(self):
        candidates = []
        userprofile = os.environ.get("USERPROFILE")
        if userprofile:
            candidates.append(os.path.join(userprofile, "Desktop"))
            candidates.append(os.path.join(userprofile, "OneDrive", "Desktop"))
            candidates.append(os.path.join(userprofile, "Área de Trabalho"))
            candidates.append(os.path.join(userprofile, "OneDrive", "Área de Trabalho"))
        candidates.append(os.path.join(os.path.expanduser("~"), "Desktop"))

        for path in candidates:
            if path:
                try:
                    os.makedirs(path, exist_ok=True)
                    return path
                except Exception:
                    continue
        return os.getcwd()

    def resolve_output_path(self, configured_dir, filename):
        if configured_dir and os.path.isdir(configured_dir):
            return os.path.join(configured_dir, filename), False

        desktop_dir = self.get_desktop_dir()
        self.log(f"[AVISO] Pasta de roteiros indisponivel: {configured_dir or '(nao configurada)'}. Salvando na Area de Trabalho: {desktop_dir}")
        return os.path.join(desktop_dir, filename), True

    def serialize_model_line(self, item):
        if getattr(item, "raw_line", ""):
            return item.raw_line
        if not item.params:
            return item.resource
        order = ['m', 't', 'i', 's', 'f', 'r', 'd', 'o', 'n', 'x', 'g']
        params = [f"/{key}:{item.params[key]}" for key in order if key in item.params]
        params.extend(f"/{key}:{value}" for key, value in item.params.items() if key not in order)
        return f"{item.resource} {' '.join(params)}"

    def generate_schedule(self, date_str, manage_busy=True):
        if manage_busy:
            self.is_busy = True
        try:
            db.clear_file_exists_cache()
            date_obj = dt.datetime.strptime(date_str, "%Y%m%d")
            weekday = date_obj.weekday()

            template_name = "SEMANAL.blmn"
            if weekday == 5:
                template_name = "SABADO.blmn"
            elif weekday == 6:
                template_name = "DOMINGO.blmn"

            template_name = config.day_templates.get(str(weekday), template_name)
            template_dir = config.get_path('MODELOS') or config.get_path('TEMPLATES')
            output_dir = config.get_path('ROTEIROS') or config.get_path('OUTPUT')
            legacy_template_name = template_name if template_name.lower().endswith(".blm") else None
            if legacy_template_name:
                template_name = f"{os.path.splitext(template_name)[0]}.blmn"

            template_path = os.path.join(template_dir, template_name)
            output_path, using_output_fallback = self.resolve_output_path(output_dir, f"{date_str}.bil")

            if not os.path.exists(template_path):
                legacy_template_path = os.path.join(template_dir, legacy_template_name) if legacy_template_name else None
                if legacy_template_path and os.path.exists(legacy_template_path):
                    model = BLMService.load_structured(legacy_template_path)
                    BLMService.save_structured(model, template_path)
                else:
                    self.log(f"Erro: Modelo nao encontrado: {template_path}")
                    return
            else:
                model = BLMService.load_structured(template_path)

            valid_blocks = [("00:00" if block.time == "24:00" else block.time) for block in model.blocks]

            paid_reservations = {}
            if weekday < 5:
                self.log("Agendando musicas pagas...")
                for rule in config.paid_rules:
                    start_str = rule['start'].replace("24:00", "00:00")
                    end_str = rule['end'].replace("24:00", "00:00")
                    start_t = dt.datetime.strptime(start_str, "%H:%M").time()
                    end_t = dt.datetime.strptime(end_str, "%H:%M").time()

                    candidates = []
                    for block_time in valid_blocks:
                        block_t = dt.datetime.strptime(block_time, "%H:%M").time()
                        if start_t <= block_t < end_t:
                            candidates.append(block_time)

                    if candidates:
                        chosen = random.choice(candidates)
                        if chosen not in paid_reservations:
                            paid_reservations[chosen] = []
                        paid_reservations[chosen].append(rule['filename'])

            self.log(f"Gerando: {template_name} -> {date_str}.bil")
            final_lines = ["# Arquivo de roteiro da beAudio\t1\t550470001"]

            for block in model.blocks:
                current_block_time = "00:00" if block.time == "24:00" else block.time
                vibe_min = int(getattr(block, "vibe_min", 0))
                vibe_max = int(getattr(block, "vibe_max", 100))
                pending_paid = paid_reservations.get(current_block_time, [])[:]

                final_lines.append(self.make_block_marker_line(current_block_time))

                for item in block.items:
                    raw_line = self.serialize_model_line(item).strip()
                    resource = (item.resource or "").strip()
                    if not resource:
                        continue

                    if 'Reserva' in resource or 'Início' in resource or 'Inicio' in resource:
                        final_lines.append("Início do bloco comercial /m:0 /t:0 /i:0 /s:0 /f:0 /r:0 /d:0 /o:3 /n:1 /x: /g:0")
                        final_lines.append("Término do bloco comercial /m:0 /t:0 /i:0 /s:0 /f:0 /r:0 /d:0 /o:4 /n:1 /x: /g:0")
                        continue

                    if 'PREFIXO' in resource or resource.startswith('U:\\'):
                        final_lines.append(self.make_bil_line(resource, self.get_audio_duration(resource), item.mix))
                        continue

                    if ".apm" not in resource.lower():
                        final_lines.append(raw_line)
                        continue

                    cat = os.path.splitext(resource)[0].strip()

                    is_custom = False
                    for cv in config.custom_vars:
                        if cv['name'].upper() == cat.upper():
                            is_custom = True
                            file_path, duration, tid = self.select_from_path(cv['path'], cat, current_block_time, date_str)
                            break

                    if is_custom:
                        final_lines.append(self.make_bil_line(file_path, duration, item.mix) if file_path else raw_line)
                        continue

                    if cat.upper() == "VINHETA":
                        file_path, duration, tid = self.select_item("VINHETA", current_block_time, date_str)
                        final_lines.append(self.make_bil_line(file_path, duration, item.mix) if file_path else raw_line)
                        continue

                    if pending_paid:
                        paid_file = pending_paid.pop(0)
                        self.log(f"  [{current_block_time}] [PAID] {paid_file} (Substituindo {cat})")
                        full_path = os.path.join(config.get_path('MUSIC_ROOT'), 'ESPECIAL', paid_file).replace('/', '\\')
                        final_lines.append(self.make_bil_line(full_path, self.get_audio_duration(full_path), item.mix))
                        continue

                    real_cat = cat.split(" ", 1)[0].upper()
                    subcats_to_search = ['TOP', 'HIT', 'STD', 'OLD']
                    if "_" in real_cat:
                        real_cat, letters = real_cat.split("_", 1)
                        subcats_to_search = []
                        if 'T' in letters:
                            subcats_to_search.append('TOP')
                        if 'H' in letters:
                            subcats_to_search.append('HIT')
                        if 'S' in letters:
                            subcats_to_search.append('STD')
                        if 'O' in letters:
                            subcats_to_search.append('OLD')
                        if not subcats_to_search:
                            subcats_to_search = ['TOP', 'HIT', 'STD', 'OLD']

                    file_path, duration, tid = self.select_music(
                        "",
                        real_cat,
                        int(current_block_time[:2]),
                        subcategory=subcats_to_search,
                        block_time=current_block_time,
                        date_str=date_str,
                        vibe_min=vibe_min,
                        vibe_max=vibe_max,
                    )

                    if file_path:
                        exec_time = f"{date_str} {current_block_time}:00"
                        if tid:
                            db.update_last_played(tid, exec_time)
                        final_lines.append(self.make_bil_line(file_path, duration, item.mix))
                    else:
                        final_lines.append(raw_line)

            import unicodedata
            normalized_content = unicodedata.normalize('NFC', "\n".join(final_lines))
            try:
                with open(output_path, 'w', encoding='latin-1', errors='replace') as f_out:
                    f_out.write(normalized_content)
            except OSError as write_error:
                if using_output_fallback:
                    raise
                fallback_dir = self.get_desktop_dir()
                fallback_path = os.path.join(fallback_dir, f"{date_str}.bil")
                self.log(f"[AVISO] Falha ao salvar em {output_path}: {write_error}. Salvando na Area de Trabalho: {fallback_path}")
                with open(fallback_path, 'w', encoding='latin-1', errors='replace') as f_out:
                    f_out.write(normalized_content)
                output_path = fallback_path

            self.log(f"Roteiro gerado com sucesso: {output_path}")

        except Exception as e:
            self.log(f"Erro na geracao: {str(e)}")
        finally:
            db.clear_file_exists_cache()
            if manage_busy:
                self.is_busy = False

    def select_music(self, folder_path, category, current_hour, subcategory=None, block_time="00:00", date_str=None, vibe_min=0, vibe_max=100):
        """Seleciona a melhor música baseado no ritmo (BPM) e descanso."""
        # Constrói o datetime simulado do bloco para cálculos de descanso corretos
        simulated_now = None
        if date_str:
            try:
                simulated_now = dt.datetime.strptime(f"{date_str} {block_time}", "%Y%m%d %H:%M")
            except:
                pass
        
        # Músicas normais precisam de descanso por tempo (4h)
        candidate, score, used_rest_fallback = db.get_best_candidate(
            category,
            current_hour,
            subcategory=subcategory,
            last_bpm=self.last_bpm,
            min_rest_hours=4,
            simulated_now=simulated_now,
            vibe_min=vibe_min,
            vibe_max=vibe_max,
        )
        if candidate:
            full_path = candidate['caminho_arquivo']
            track_id = candidate['id']
            duration = candidate['duracao'] or 0
            if duration <= 3:
                duration = self.get_audio_duration(full_path)
            self.last_bpm = candidate['bpm'] or 0
            
            track_name = os.path.basename(full_path)
            if used_rest_fallback:
                self.log(f"  [{block_time}] AVISO [{category}] Sem opcao com descanso de 4h; usando fallback sem descanso minimo.")
            self.log(f"  [{block_time}] 🎵 [{category}] {track_name} (Score: {int(score)})")
            
            db.log_execution(full_path, scheduled_time=simulated_now)
            return full_path, int(duration), track_id
        
        self.log(f"  [{block_time}] ⚠️ [{category}] Nenhuma música disponível que respeite os filtros.")
        return None, 0, None

    def select_item(self, category, block_time="00:00", date_str=None):
        """Sorteia um item (vinheta, chamada, etc) direto da pasta global."""
        simulated_now = None
        if date_str:
            try:
                simulated_now = dt.datetime.strptime(f"{date_str} {block_time}", "%Y%m%d %H:%M")
            except:
                pass
        
        folder_path = config.get_path(category) # Vai buscar 'VINHETA' no config
        return self.select_from_path(folder_path, category, block_time, date_str, simulated_now)

    def select_from_path(self, folder_path, log_name, block_time="00:00", date_str=None, simulated_now=None):
        """Lógica genérica para sortear um arquivo de um caminho de pasta ou injetar caminho direto"""
        if not folder_path or not os.path.exists(folder_path): return None, 0, None
        
        # 1. Se for um arquivo direto, retorna ele mesmo
        if os.path.isfile(folder_path):
            full_path = folder_path.replace('/', '\\')
            self.log(f"  [{block_time}] 🔈 [{log_name}] {os.path.basename(full_path)}")
            ts = simulated_now
            if not ts and date_str:
                try:
                    ts = dt.datetime.strptime(f"{date_str} {block_time}", "%Y%m%d %H:%M")
                except:
                    pass
            db.log_execution(full_path, scheduled_time=ts)
            return full_path, self.get_audio_duration(full_path), None

        # 2. Se for um diretório, sorteia o item (evitando históricos)
        files = [f for f in os.listdir(folder_path) if f.lower().endswith(AUDIO_EXTENSIONS)]
        if not files: return None, 0, None
        
        # Histórico de 3 slots (lê o histórico de caminhos do banco)
        recent_tracks = db.get_recent_tracks(3)
        
        # Filtra candidatos que não estão nos últimos 3 slots
        candidates = [f for f in files if os.path.join(folder_path, f).replace('/', '\\') not in recent_tracks]
        
        # Fallback se todos estiverem no histórico ou pasta for muito pequena
        choice = random.choice(candidates if candidates else files)
        full_path = os.path.join(folder_path, choice).replace('/', '\\')
        
        self.log(f"  [{block_time}] 🔈 [{log_name}] {choice}")
        
        ts = simulated_now
        if not ts and date_str:
            try:
                ts = dt.datetime.strptime(f"{date_str} {block_time}", "%Y%m%d %H:%M")
            except:
                pass

        db.log_execution(full_path, scheduled_time=ts)
        
        return full_path, self.get_audio_duration(full_path), None
