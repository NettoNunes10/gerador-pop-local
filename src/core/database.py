import sqlite3
import datetime
import os
from .config import config

DB_PATH = "base_dados_radio.db"

class DatabaseManager:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        cursor = self.conn.cursor()
        
        # Tabela biblioteca
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS biblioteca (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                caminho_arquivo TEXT UNIQUE,
                nome_musica TEXT,
                artista TEXT,
                pasta_categoria TEXT,
                bpm REAL,
                peso_especifico REAL DEFAULT 1.0
            )
        ''')

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
        
        self.conn.commit()

    def add_to_library(self, file_path, artist, title, category, bpm=0.0):
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                INSERT INTO biblioteca (caminho_arquivo, nome_musica, artista, pasta_categoria, bpm)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(caminho_arquivo) DO UPDATE SET
                    nome_musica=excluded.nome_musica,
                    artista=excluded.artista,
                    pasta_categoria=excluded.pasta_categoria,
                    bpm=CASE WHEN excluded.bpm > 0 THEN excluded.bpm ELSE bpm END
            ''', (file_path, title, artist, category, bpm))
            self.conn.commit()
        except Exception as e:
            print(f"Erro ao adicionar à biblioteca: {e}")

    def log_execution(self, filepath):
        now = datetime.datetime.now()
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO historico_execucao (caminho_arquivo, data_hora, dia_semana)
            VALUES (?, ?, ?)
        ''', (filepath, now, now.weekday()))
        self.conn.commit()

    def get_best_candidate(self, category_folder, current_hour, last_bpm=0, min_rest_hours=4):
        cursor = self.conn.cursor()
        
        # 1. Pegar todos os arquivos da biblioteca que pertencem a esta categoria
        # e que existem fisicamente (pelo caminho)
        cursor.execute('''
            SELECT b.*, f.multiplicador,
                   (SELECT MAX(data_hora) FROM historico_execucao h WHERE h.caminho_arquivo = b.caminho_arquivo) as ultima_vez
            FROM biblioteca b
            LEFT JOIN artistas_favoritos f ON b.artista = f.nome_artista
            WHERE b.pasta_categoria = ?
        ''', (category_folder,))
        
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

    def update_weight(self, track_id, weight):
        """Atualiza o multiplicador de peso de uma música específica."""
        self.conn.execute("UPDATE biblioteca SET peso_especifico = ? WHERE id = ?", (weight, track_id))
        self.conn.commit()

db = DatabaseManager()
