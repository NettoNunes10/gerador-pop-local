import sqlite3
import datetime
import os
import threading
import random
import unicodedata
from .config import config

DB_PATH = "base_dados_radio.db"

class DatabaseManager:
    def __init__(self):
        self._local = threading.local()
        conn = self._get_conn()
        self._create_tables(conn)
        self.migrate_vibe_scores()
        self.sync_favorites(list(config.favorite_artists))

    def _get_conn(self):
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            try:
                conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA journal_mode=WAL")   
                conn.execute("PRAGMA synchronous=OFF")
                
                # Função customizada para busca sem acentos
                def remove_accents(s):
                    if not s: return ""
                    return "".join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
                
                conn.create_function("unaccent", 1, remove_accents)
                
                self._local.conn = conn
            except Exception as e:
                print(f"CRITICAL DB ERROR: {e}")
                return None
        return self._local.conn

    @property
    def conn(self):
        c = self._get_conn()
        if c is None: raise Exception("Banco de dados inacessível")
        return c

    def _create_tables(self, conn):
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS biblioteca (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                caminho_arquivo TEXT UNIQUE,
                nome_musica TEXT,
                artista TEXT,
                pasta_categoria TEXT,
                sub_categoria TEXT,
                bpm REAL DEFAULT NULL,
                peso_especifico REAL DEFAULT 1.0,
                data_arquivo TEXT,
                duracao INTEGER DEFAULT 0,
                energy REAL DEFAULT NULL,
                valence REAL DEFAULT NULL,
                vibe INTEGER DEFAULT NULL,
                data_ultima_execucao TEXT
            )
        ''')
        # Migrações silenciosas — adicionar colunas que podem não existir em DBs antigos
        cols = [
            "sub_categoria TEXT",
            "data_arquivo TEXT",
            "duracao INTEGER DEFAULT 0",
            "energy REAL DEFAULT NULL",
            "valence REAL DEFAULT NULL",
            "vibe INTEGER DEFAULT NULL",
            "data_ultima_execucao TEXT",
        ]
        for c in cols:
            try: cursor.execute(f"ALTER TABLE biblioteca ADD COLUMN {c}")
            except: pass

        cursor.execute('CREATE TABLE IF NOT EXISTS artistas_favoritos (nome_artista TEXT PRIMARY KEY, multiplicador REAL DEFAULT 1.5)')
        cursor.execute('CREATE TABLE IF NOT EXISTS historico_execucao (id INTEGER PRIMARY KEY AUTOINCREMENT, caminho_arquivo TEXT, data_hora TIMESTAMP, dia_semana INTEGER)')
        conn.commit()

    def insert_music(self, nome_musica, artista, caminho_arquivo, pasta_categoria, bpm, duracao, energy=None, valence=None, vibe=None, sub_categoria='STD', data_arquivo=None):
        try:
            self.conn.execute('''
                INSERT INTO biblioteca (
                    caminho_arquivo, artista, nome_musica, pasta_categoria, bpm, duracao, 
                    energy, valence, vibe, sub_categoria, data_arquivo
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(caminho_arquivo) DO UPDATE SET
                    artista=excluded.artista,
                    nome_musica=excluded.nome_musica,
                    pasta_categoria=excluded.pasta_categoria,
                    bpm=CASE WHEN excluded.bpm > 0 THEN excluded.bpm ELSE biblioteca.bpm END,
                    duracao=excluded.duracao,
                    energy=CASE WHEN excluded.energy > 0.5 THEN excluded.energy ELSE biblioteca.energy END,
                    valence=CASE WHEN excluded.valence > 0.5 THEN excluded.valence ELSE biblioteca.valence END,
                    vibe=CASE WHEN excluded.vibe > 0 THEN excluded.vibe ELSE biblioteca.vibe END,
                    sub_categoria=excluded.sub_categoria,
                    data_arquivo=COALESCE(data_arquivo, excluded.data_arquivo)
            ''', (caminho_arquivo, artista, nome_musica, pasta_categoria, bpm, duracao, 
                  energy, valence, vibe, sub_categoria, data_arquivo))
            self.conn.commit()
        except Exception as e:
            print(f"Erro ao inserir música: {e}")

    def log_execution(self, filepath, scheduled_time=None):
        """Registra a execução de um arquivo. Usa scheduled_time (datetime do bloco) se fornecido."""
        ts = scheduled_time or datetime.datetime.now()
        self.conn.execute('INSERT INTO historico_execucao (caminho_arquivo, data_hora, dia_semana) VALUES (?, ?, ?)', (filepath, ts, ts.weekday()))
        self.conn.commit()

    def update_last_played(self, track_id, timestamp):
        """Marca a data e hora em que a música foi agendada/tocada."""
        self.conn.execute(
            "UPDATE biblioteca SET data_ultima_execucao = ? WHERE id = ?",
            (timestamp, track_id)
        )
        self.conn.commit()

    def reset_all_history(self):
        """Semeia um passado falso proporcional ao peso de cada música (Big Bang)."""
        now = datetime.datetime.now()
        
        # 1. Limpa o histórico antigo
        self.conn.execute("DELETE FROM historico_execucao")
        
        # 2. Busca todas as músicas e distribui timestamps falsos
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, peso_especifico FROM biblioteca")
        tracks = cursor.fetchall()
        
        for track in tracks:
            track_id = track['id']
            weight = track['peso_especifico'] or 1.0
            
            if weight >= 2.5:
                # TOP: tocou entre 2 e 16 horas atrás
                hours_ago = random.uniform(2, 16)
            elif weight >= 1.0:
                # NORMAL: tocou entre 10 e 72 horas atrás
                hours_ago = random.uniform(10, 72)
            else:
                # LIGHT: tocou entre 1 e 40 dias atrás
                hours_ago = random.uniform(24, 24 * 40)
            
            fake_time = now - datetime.timedelta(hours=hours_ago)
            self.conn.execute(
                "UPDATE biblioteca SET data_ultima_execucao = ? WHERE id = ?",
                (fake_time.isoformat(), track_id)
            )
            # Insere também no histórico para que get_recent_artists/tracks funcione
            self.conn.execute(
                'INSERT INTO historico_execucao (caminho_arquivo, data_hora, dia_semana) '
                'SELECT caminho_arquivo, ?, ? FROM biblioteca WHERE id = ?',
                (fake_time, fake_time.weekday(), track_id)
            )
        
        self.conn.commit()

    def update_subcategory(self, track_id, subcat):
        self.conn.execute("UPDATE biblioteca SET sub_categoria = ? WHERE id = ?", (subcat, track_id))
        self.conn.commit()

    def update_weight(self, track_id, weight):
        self.conn.execute("UPDATE biblioteca SET peso_especifico = ? WHERE id = ?", (weight, track_id))
        self.conn.commit()

    def update_enrichment(self, track_id, data):
        """Atualiza campos de inteligência musical."""
        self.conn.execute('''
            UPDATE biblioteca SET 
                bpm = ?, 
                energy = ?, 
                valence = ?, 
                vibe = ? 
            WHERE id = ?
        ''', (data.get('bpm', 0), data.get('energy', 0), data.get('valence', 0), data.get('vibe', 50), track_id))
        self.conn.commit()

    def migrate_vibe_scores(self):
        """Atualiza vibe de 1-4 para a média (energy + valence) / 2."""
        try:
            # Procura itens onde vibe < 5 e energy/valence existem
            self.conn.execute("""
                UPDATE biblioteca 
                SET vibe = CAST((energy + valence) / 2 AS INTEGER)
                WHERE (vibe < 5 OR vibe IS NULL) AND energy > 0 AND valence > 0
            """)
            self.conn.commit()
        except Exception as e:
            print(f"❌ Erro na migração de vibe: {e}")

    def get_recent_artists(self, limit=10):
        """Retorna um conjunto de nomes de artistas que tocaram recentemente."""
        if limit <= 0: return set()
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT b.artista 
            FROM historico_execucao h
            JOIN biblioteca b ON h.caminho_arquivo = b.caminho_arquivo
            ORDER BY h.id DESC
            LIMIT ?
        ''', (limit,))
        
        recent = set()
        for row in cursor.fetchall():
            if row[0]:
                # Artistas são salvos como "ARTISTA 1, ARTISTA 2"
                parts = [a.strip().upper() for a in row[0].split(',')]
                recent.update(parts)
        return recent

    def get_recent_tracks(self, limit=5):
        """Retorna uma lista dos caminhos de arquivos tocados recentemente."""
        if limit <= 0: return set()
        cursor = self.conn.cursor()
        cursor.execute('SELECT caminho_arquivo FROM historico_execucao ORDER BY id DESC LIMIT ?', (limit,))
        return {row[0] for row in cursor.fetchall()}

    def sync_favorites(self, artist_list):
        """Sincroniza a lista de artistas favoritos do config com o banco de dados."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM artistas_favoritos")
        for artist in artist_list:
            cursor.execute("INSERT OR IGNORE INTO artistas_favoritos (nome_artista) VALUES (?)", (artist.strip().upper(),))
        self.conn.commit()

    def get_best_candidate(self, category_folder, current_hour, subcategory=None, last_bpm=0, min_rest_hours=4, min_rest_slots=0, simulated_now=None, vibe_min=0, vibe_max=100):
        cursor = self.conn.cursor()
        query = '''
            SELECT b.*,
                   (SELECT MAX(data_hora) FROM historico_execucao h WHERE h.caminho_arquivo = b.caminho_arquivo) as ultima_vez
            FROM biblioteca b
            WHERE b.pasta_categoria = ?
        '''
        params = [category_folder]
        if subcategory:
            if isinstance(subcategory, (list, tuple)) and subcategory:
                placeholders = ','.join('?' * len(subcategory))
                query += f" AND b.sub_categoria IN ({placeholders})"
                params.extend(subcategory)
            else:
                query += " AND b.sub_categoria = ?"
                params.append(subcategory)
        query += " AND (b.vibe IS NULL OR (b.vibe >= ? AND b.vibe <= ?))"
        params.extend([vibe_min, vibe_max])
        
        # Aleatoriedade via SQL e limite de busca para performance
        query += " ORDER BY RANDOM() LIMIT 500"
        
        cursor.execute(query, params)
        candidates = cursor.fetchall()
        if not candidates: return None, -1

        now = simulated_now or datetime.datetime.now()
        recent_artists = self.get_recent_artists(config.artist_separation)
        recent_tracks = self.get_recent_tracks(min_rest_slots)
        
        return self._evaluate_candidates(candidates, now, recent_artists, recent_tracks, last_bpm, min_rest_hours)

    def _evaluate_candidates(self, candidates, now, recent_artists, recent_tracks, last_bpm, min_rest_hours):
        best_candidate = None
        best_score = -1.0
        
        for cand in candidates:
            filepath = cand['caminho_arquivo']
            if not os.path.exists(filepath): continue
            
            # FILTRO DE REPETIÇÃO POR SLOT (Espaços)
            if filepath in recent_tracks: continue
            cand_artists = [a.strip().upper() for a in (cand['artista'] or "").split(',')]
            is_recent = any(a in recent_artists for a in cand_artists)
            
            # FILTRO DE RITMO (BPM)
            current_bpm = cand['bpm'] or 0
            if last_bpm > 0 and last_bpm < 80 and current_bpm > 0 and current_bpm < 80:
                continue

            # FILTRO DE DESCANSO
            ultima_vez_str = cand['ultima_vez']
            if ultima_vez_str:
                ultima_vez = datetime.datetime.fromisoformat(ultima_vez_str)
                delta = now - ultima_vez
                if delta.total_seconds() < min_rest_hours * 3600: continue
                minutes_since = delta.total_seconds() / 60
            else:
                minutes_since = 14400 

            weight = cand['peso_especifico'] or 1.0
            
            # Cálculo de Multiplicador (Favoritos)
            is_favorite = any(a in config.favorite_artists for a in cand_artists)
            mult = 1.5 if is_favorite else 1.0
            
            # Peso Exponencial (Peso ^ 2) para dar muito mais agressividade às músicas marcadas
            score = (minutes_since * (weight ** 2) * mult) + random.uniform(0, 10)
            if is_recent: score *= 0.1 

            if score > best_score:
                best_score = score
                best_candidate = cand
        
        # PROTEÇÃO ANTI-COLISÃO: evita dois super hits colados
        if best_candidate:
            winner_weight = best_candidate['peso_especifico'] or 1.0
            if winner_weight >= 2.0:
                # Verifica se alguma música com peso similar (±0.4) tocou recentemente
                recent_heavy = False
                cursor = self.conn.cursor()
                cursor.execute('''
                    SELECT b.peso_especifico FROM historico_execucao h
                    JOIN biblioteca b ON h.caminho_arquivo = b.caminho_arquivo
                    ORDER BY h.data_hora DESC LIMIT 1
                ''')
                last_row = cursor.fetchone()
                if last_row and last_row[0] is not None:
                    last_weight = last_row[0]
                    if abs(winner_weight - last_weight) <= 0.4 and last_weight >= 2.0:
                        recent_heavy = True
                
                if recent_heavy and random.random() < 0.5:
                    # 50% de chance: pula para a segunda colocada
                    second_best = None
                    second_score = -1.0
                    for cand in candidates:
                        if cand['id'] == best_candidate['id']: continue
                        w = cand['peso_especifico'] or 1.0
                        if w >= 2.0: continue  # Pula outros pesados também
                        filepath = cand['caminho_arquivo']
                        if not os.path.exists(filepath): continue
                        if filepath in recent_tracks: continue
                        
                        cand_artists = [a.strip().upper() for a in (cand['artista'] or "").split(',')]
                        
                        ultima_vez_str = cand['ultima_vez']
                        if ultima_vez_str:
                            try:
                                ultima_vez = datetime.datetime.fromisoformat(ultima_vez_str)
                                delta = now - ultima_vez
                                minutes_since = delta.total_seconds() / 60
                            except:
                                minutes_since = 14400
                        else:
                            minutes_since = 14400
                        
                        sc = (minutes_since * (w ** 2)) + random.uniform(0, 10)
                        is_recent_art = any(a in recent_artists for a in cand_artists)
                        if is_recent_art: sc *= 0.1
                        
                        if sc > second_score:
                            second_score = sc
                            second_best = cand
                    
                    if second_best:
                        best_candidate = second_best
                        best_score = second_score
        
        # Se não encontrou ninguém com os filtros, tenta ignorar o descanso (fallback)
        if not best_candidate and min_rest_hours > 0:
            return self._evaluate_candidates(candidates, now, recent_artists, recent_tracks, last_bpm, 0)
            
        return best_candidate, best_score

    def get_stats(self):
        stats = {}
        cursor = self.conn.execute("SELECT pasta_categoria, COUNT(*) FROM biblioteca GROUP BY pasta_categoria")
        stats['categories'] = [{'name': r[0], 'value': r[1]} for r in cursor.fetchall()]
        cursor = self.conn.execute("SELECT artista, COUNT(*) as c FROM biblioteca GROUP BY artista ORDER BY c DESC LIMIT 5")
        stats['top_artists'] = [{'name': r[0], 'value': r[1]} for r in cursor.fetchall()]
        return stats

db = DatabaseManager()
