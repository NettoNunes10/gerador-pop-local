import sqlite3
import datetime
import os
import threading
from .config import config

DB_PATH = "base_dados_radio.db"

class DatabaseManager:
    def __init__(self):
        self._local = threading.local()
        conn = self._get_conn()
        self._create_tables(conn)

    def _get_conn(self):
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            try:
                conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA journal_mode=WAL")   
                conn.execute("PRAGMA synchronous=OFF")
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
                bpm REAL DEFAULT 0,
                peso_especifico REAL DEFAULT 1.0,
                data_arquivo TEXT,
                duracao INTEGER DEFAULT 0,
                energy REAL DEFAULT 0.5,
                valence REAL DEFAULT 0.5,
                danceability REAL DEFAULT 0.5,
                spotify_id TEXT
            )
        ''')
        # Migrações silenciosas
        cols = ["sub_categoria TEXT", "data_arquivo TEXT", "duracao INTEGER DEFAULT 0", "energy REAL DEFAULT 0.5", "valence REAL DEFAULT 0.5", "danceability REAL DEFAULT 0.5", "spotify_id TEXT"]
        for c in cols:
            try: cursor.execute(f"ALTER TABLE biblioteca ADD COLUMN {c}")
            except: pass

        cursor.execute('CREATE TABLE IF NOT EXISTS artistas_favoritos (nome_artista TEXT PRIMARY KEY, multiplicador REAL DEFAULT 1.5)')
        cursor.execute('CREATE TABLE IF NOT EXISTS historico_execucao (id INTEGER PRIMARY KEY AUTOINCREMENT, caminho_arquivo TEXT, data_hora TIMESTAMP, dia_semana INTEGER)')
        conn.commit()

    def insert_music(self, nome_musica, artista, caminho_arquivo, pasta_categoria, bpm, duracao, energy=0.5, valence=0.5, danceability=0.5, spotify_id=None, sub_categoria='STD', data_arquivo=None):
        try:
            self.conn.execute('''
                INSERT INTO biblioteca (
                    caminho_arquivo, artista, nome_musica, pasta_categoria, bpm, duracao, 
                    energy, valence, danceability, spotify_id, sub_categoria, data_arquivo
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(caminho_arquivo) DO UPDATE SET
                    artista=excluded.artista,
                    nome_musica=excluded.nome_musica,
                    pasta_categoria=excluded.pasta_categoria,
                    bpm=excluded.bpm,
                    duracao=excluded.duracao,
                    sub_categoria=excluded.sub_categoria,
                    data_arquivo=COALESCE(data_arquivo, excluded.data_arquivo)
            ''', (caminho_arquivo, artista, nome_musica, pasta_categoria, bpm, duracao, 
                  energy, valence, danceability, spotify_id, sub_categoria, data_arquivo))
            self.conn.commit()
        except Exception as e:
            print(f"Erro ao inserir música: {e}")

    def log_execution(self, filepath):
        now = datetime.datetime.now()
        self.conn.execute('INSERT INTO historico_execucao (caminho_arquivo, data_hora, dia_semana) VALUES (?, ?, ?)', (filepath, now, now.weekday()))
        self.conn.commit()

    def update_last_played(self, track_id, timestamp):
        """Marca a data e hora em que a música foi agendada/tocada."""
        self.conn.execute(
            "UPDATE biblioteca SET data_ultima_execucao = ? WHERE id = ?",
            (timestamp, track_id)
        )
        self.conn.commit()

    def update_subcategory(self, track_id, subcat):
        self.conn.execute("UPDATE biblioteca SET sub_categoria = ? WHERE id = ?", (subcat, track_id))
        self.conn.commit()

    def get_best_candidate(self, category_folder, current_hour, subcategory=None, last_bpm=0, min_rest_hours=4):
        cursor = self.conn.cursor()
        query = '''
            SELECT b.*, f.multiplicador,
                   (SELECT MAX(data_hora) FROM historico_execucao h WHERE h.caminho_arquivo = b.caminho_arquivo) as ultima_vez
            FROM biblioteca b
            LEFT JOIN artistas_favoritos f ON b.artista = f.nome_artista
            WHERE b.pasta_categoria = ?
        '''
        params = [category_folder]
        if subcategory:
            query += " AND b.sub_categoria = ?"
            params.append(subcategory)
        cursor.execute(query, params)
        candidates = cursor.fetchall()
        if not candidates: return None

        now = datetime.datetime.now()
        best_candidate = None
        best_score = -1.0

        for cand in candidates:
            filepath = cand['caminho_arquivo']
            if not os.path.exists(filepath): continue
            
            # FILTRO DE RITMO (BPM): Evita quebrar a cadência
            # Se a última foi lenta (<80), evita outra lenta para manter a rádio viva
            current_bpm = cand['bpm'] or 0
            if last_bpm > 0 and last_bpm < 80 and current_bpm > 0 and current_bpm < 80:
                continue

            ultima_vez_str = cand['ultima_vez']
            if ultima_vez_str:
                ultima_vez = datetime.datetime.fromisoformat(ultima_vez_str)
                delta = now - ultima_vez
                if delta.total_seconds() < min_rest_hours * 3600: continue
                minutes_since = delta.total_seconds() / 60
            else:
                minutes_since = 14400 

            weight = cand['peso_especifico'] or 1.0
            mult = cand['multiplicador'] or 1.0
            score = minutes_since * weight * mult
            
            if score > best_score:
                best_score = score
                best_candidate = cand
        return best_candidate

    def get_stats(self):
        stats = {}
        cursor = self.conn.execute("SELECT pasta_categoria, COUNT(*) FROM biblioteca GROUP BY pasta_categoria")
        stats['categories'] = [{'name': r[0], 'value': r[1]} for r in cursor.fetchall()]
        cursor = self.conn.execute("SELECT artista, COUNT(*) as c FROM biblioteca GROUP BY artista ORDER BY c DESC LIMIT 5")
        stats['top_artists'] = [{'name': r[0], 'value': r[1]} for r in cursor.fetchall()]
        return stats

db = DatabaseManager()
