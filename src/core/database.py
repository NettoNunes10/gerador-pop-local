import sqlite3
import datetime
import os
import threading
from .config import config

DB_PATH = "base_dados_radio.db"

class DatabaseManager:
    def __init__(self):
        self._local = threading.local()
        # Cria as tabelas usando uma conexão inicial temporária
        conn = self._get_conn()
        self._create_tables(conn)

    def _get_conn(self):
        """Retorna a conexão SQLite da thread atual (cria se não existir)."""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            try:
                conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30) # Aumentado timeout
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA journal_mode=WAL")   
                conn.execute("PRAGMA synchronous=OFF")    # Mais performance, menos bloqueio
                conn.execute("PRAGMA busy_timeout=10000") # 10 segundos
                conn.execute("PRAGMA journal_size_limit=10000000") # Limita arquivo WAL a 10MB
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
        
        # Tabela biblioteca
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS biblioteca (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                caminho_arquivo TEXT UNIQUE,
                nome_musica TEXT,
                artista TEXT,
                pasta_categoria TEXT,
                sub_categoria TEXT,
                bpm REAL,
                peso_especifico REAL DEFAULT 1.0,
                data_arquivo TEXT
            )
        ''')
        # Migração: garantir colunas para bancos existentes
        for col_def in [
            "ALTER TABLE biblioteca ADD COLUMN sub_categoria TEXT",
            "ALTER TABLE biblioteca ADD COLUMN data_arquivo TEXT"
        ]:
            try:
                cursor.execute(col_def)
            except:
                pass

        # Tabela artistas_favoritos
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS artistas_favoritos (
                nome_artista TEXT PRIMARY KEY,
                multiplicador REAL DEFAULT 1.5
            )
        ''')

        # Tabela historico_execucao
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS historico_execucao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                caminho_arquivo TEXT,
                data_hora TIMESTAMP,
                dia_semana INTEGER
            )
        ''')

        # Semente inicial de artistas favoritos se a tabela estiver vazia
        cursor.execute("SELECT COUNT(*) FROM artistas_favoritos")
        if cursor.fetchone()[0] == 0:
            for artist in config.favorite_artists:
                cursor.execute("INSERT OR IGNORE INTO artistas_favoritos (nome_artista, multiplicador) VALUES (?, ?)", (artist, 1.5))
        
        conn.commit()
        
        # Otimização: Limpa logs e reconstrói banco (previne travamento por arquivo WAL gigante)
        try:
            conn.execute("PRAGMA optimize")
            conn.execute("VACUUM")
        except: pass

    def add_to_library(self, filepath, artists, title, category, bpm, subcat='STD', data_arquivo=None):
        """Adiciona ou atualiza uma música na biblioteca."""
        try:
            self.conn.execute('''
                INSERT INTO biblioteca (caminho_arquivo, artista, nome_musica, pasta_categoria, bpm, sub_categoria, data_arquivo)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(caminho_arquivo) DO UPDATE SET
                    artista=excluded.artista,
                    nome_musica=excluded.nome_musica,
                    pasta_categoria=excluded.pasta_categoria,
                    bpm=excluded.bpm,
                    sub_categoria=excluded.sub_categoria,
                    data_arquivo=COALESCE(data_arquivo, excluded.data_arquivo)
            ''', (filepath, artists, title, category, bpm, subcat, data_arquivo))
            self.conn.commit()
        except Exception as e:
            print(f"Erro ao adicionar à biblioteca: {e}")

    def log_execution(self, filepath):
        now = datetime.datetime.now()
        self.conn.execute('''
            INSERT INTO historico_execucao (caminho_arquivo, data_hora, dia_semana)
            VALUES (?, ?, ?)
        ''', (filepath, now, now.weekday()))
        self.conn.commit()

    def update_subcategory(self, track_id, subcat):
        """Atualiza a subcategoria (tag) de uma música."""
        self.conn.execute("UPDATE biblioteca SET sub_categoria = ? WHERE id = ?", (subcat, track_id))
        self.conn.commit()

    def update_weight(self, track_id, weight):
        """Atualiza o multiplicador de peso de uma música específica."""
        self.conn.execute("UPDATE biblioteca SET peso_especifico = ? WHERE id = ?", (weight, track_id))
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
        if not candidates:
            return None

        now = datetime.datetime.now()
        best_candidate = None
        best_score = -1.0

        for cand in candidates:
            filepath = cand['caminho_arquivo']
            # Filtro físico: se o arquivo não existe, ignora
            if not os.path.exists(filepath):
                continue
                
            # Filtro de BPM: Se o último foi lento, evita lento (ex: lento < 80 BPM)
            if last_bpm > 0 and last_bpm < 80 and cand['bpm'] > 0 and cand['bpm'] < 80:
                continue

            # Cálculo de Tempo desde a última execução
            ultima_vez_str = cand['ultima_vez']
            if ultima_vez_str:
                ultima_vez = datetime.datetime.fromisoformat(ultima_vez_str)
                delta = now - ultima_vez
                minutes_since = delta.total_seconds() / 60
                
                # Filtro de Descanso Mínimo (4 horas)
                if delta.total_seconds() < min_rest_hours * 3600:
                    continue
            else:
                # Se nunca tocou, prioridade alta
                minutes_since = 14400 # 10 dias em minutos para garantir score alto

            # Fator de Dayparting: Penaliza se tocou no mesmo horário ontem (+/- 1h)
            dayparting_factor = 1.0
            cursor.execute('''
                SELECT COUNT(*) FROM historico_execucao
                WHERE caminho_arquivo = ? 
                AND data_hora >= ? AND data_hora <= ?
            ''', (filepath, 
                  (now - datetime.timedelta(days=1, hours=1)).isoformat(),
                  (now - datetime.timedelta(days=1, hours=-1)).isoformat()))
            
            if cursor.fetchone()[0] > 0:
                dayparting_factor = 0.5

            # Multiplicadores
            weight = cand['peso_especifico'] or 1.0
            mult = cand['multiplicador'] or 1.0
            
            # Score Final
            score = minutes_since * weight * mult * dayparting_factor
            
            if score > best_score:
                best_score = score
                best_candidate = cand

        return best_candidate  # ← Bug corrigido: return estava faltando!

    def get_stats(self):
        """Retorna estatísticas para os gráficos do Dashboard."""
        stats = {}
        # Músicas por Categoria
        cursor = self.conn.execute("SELECT pasta_categoria, COUNT(*) FROM biblioteca GROUP BY pasta_categoria")
        stats['categories'] = [{'name': r[0], 'value': r[1]} for r in cursor.fetchall()]
        
        # Top Artistas
        cursor = self.conn.execute("SELECT artista, COUNT(*) as c FROM biblioteca GROUP BY artista ORDER BY c DESC LIMIT 5")
        stats['top_artists'] = [{'name': r[0], 'value': r[1]} for r in cursor.fetchall()]
        
        return stats

db = DatabaseManager()
