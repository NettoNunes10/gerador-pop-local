import json
import os

CONFIG_FILE = "settings.json"

# Grupos de rotação padrão (configuráveis via settings.json)
DEFAULT_ROTATION_GROUPS = [
    {"name": "TOP", "min_weight": 3.0, "base_weight": 3.0},
    {"name": "HIT", "min_weight": 2.0, "base_weight": 2.0},
    {"name": "STD", "min_weight": 1.0, "base_weight": 1.0},
    {"name": "OLD", "min_weight": 0.0, "base_weight": 0.5},
]

class ConfigManager:
    def __init__(self):
        self.paths = {
            'MUSIC_ROOT': 'M:/',
            'VINHETA': 'U:/Materiais/Eventos Gerais/VHT - Geração',
            'PREFIXO': 'U:/Materiais/Eventos Gerais/Prefixo/PREFIXO POP FM.mp3',
            'PROMOS': 'U:/Materiais/Eventos Gerais/Chamadas Programas',
            'INTERCOM': 'U:/Materiais/Eventos Gerais/Intercom',
            'SAMPLES': 'U:/Materiais/Eventos Gerais/Amostra Musical',
            'MODELOS': 'U:/Materiais/Roteiros/Modelos',
            'ROTEIROS': 'U:/Materiais/Roteiros',
            'spotify_client_id': '',
            'spotify_client_secret': '',
            'ENRICHMENT_API_URL': 'http://localhost:8001/enrich'
        }
        self.artist_separation = 9
        self.favorite_artists = set()
        self.paid_rules = []
        self.day_templates = {
            "0": "SEGUNDA.blmn",
            "1": "TERCA.blmn",
            "2": "QUARTA.blmn",
            "3": "QUINTA.blmn",
            "4": "SEXTA.blmn",
            "5": "SABADO.blmn",
            "6": "DOMINGO.blmn"
        }
        self.rotation_groups = DEFAULT_ROTATION_GROUPS[:]
        self.custom_vars = []  # Lista de dicts: {"name": "Nome", "path": "...", "color": "#..."}
        self.default_category = "SERTANEJO"
        self.default_vibe_min = 0
        self.default_vibe_max = 100
        self.type_colors = {
            'MUSICA': '#00f2ff',
            'VHT': '#bc13fe',
            'RESERVA': '#ffaa00',
            'PREFIXO': '#4cd964'
        }
        self.load()

    def load(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.paths.update(data.get('paths', {}))
                    self.favorite_artists = set(data.get('favorite_artists', []))
                    self.artist_separation = data.get('artist_separation', 9)
                    self.paid_rules = data.get('paid_rules', [])
                    self.day_templates.update(data.get('day_templates', {}))
                    if 'rotation_groups' in data:
                        self.rotation_groups = data.get('rotation_groups', DEFAULT_ROTATION_GROUPS[:])
                    self.custom_vars = data.get('custom_vars', [])
                    self.default_category = data.get('default_category', "SERTANEJO")
                    self.default_vibe_min = data.get('default_vibe_min', 0)
                    self.default_vibe_max = data.get('default_vibe_max', 100)
                    self.type_colors.update(data.get('type_colors', {}))
            except Exception as e:              pass

    def get_path(self, key):
        return self.paths.get(key, "")

    def get_group_for_weight(self, weight):
        """Retorna o nome do grupo de rotação baseado no peso."""
        # Ordena por min_weight decrescente para pegar o maior threshold que o peso supera
        sorted_groups = sorted(self.rotation_groups, key=lambda g: g['min_weight'], reverse=True)
        for group in sorted_groups:
            if weight >= group['min_weight']:
                return group['name']
        return self.rotation_groups[-1]['name']  # Fallback para o último grupo (OLD)

    def get_base_weight_for_group(self, group_name):
        """Retorna o peso base de um grupo de rotação."""
        for group in self.rotation_groups:
            if group['name'] == group_name:
                return group['base_weight']
        return 1.0  # Fallback

    def save(self, new_config=None):
        if new_config:
            if 'paths' in new_config:
                self.paths.update(new_config['paths'])
            if 'favorite_artists' in new_config:
                self.favorite_artists = set(new_config['favorite_artists'])
            if 'paid_rules' in new_config:
                self.paid_rules = new_config['paid_rules']
            if 'day_templates' in new_config:
                self.day_templates.update(new_config['day_templates'])
            if 'rotation_groups' in new_config:
                self.rotation_groups = new_config['rotation_groups']
            if 'custom_vars' in new_config:
                self.custom_vars = new_config['custom_vars']
            if 'default_category' in new_config:
                self.default_category = new_config['default_category']
            if 'default_vibe_min' in new_config:
                self.default_vibe_min = int(new_config['default_vibe_min'])
            if 'default_vibe_max' in new_config:
                self.default_vibe_max = int(new_config['default_vibe_max'])
            self.default_vibe_min = max(0, min(100, self.default_vibe_min))
            self.default_vibe_max = max(0, min(100, self.default_vibe_max))
            if self.default_vibe_min > self.default_vibe_max:
                self.default_vibe_max = self.default_vibe_min
            if 'type_colors' in new_config:
                self.type_colors.update(new_config['type_colors'])

        data = {
            'paths': self.paths,
            'artist_separation': self.artist_separation,
            'favorite_artists': list(self.favorite_artists),
            'paid_rules': self.paid_rules,
            'day_templates': self.day_templates,
            'rotation_groups': self.rotation_groups,
            'custom_vars': self.custom_vars,
            'default_category': self.default_category,
            'default_vibe_min': self.default_vibe_min,
            'default_vibe_max': self.default_vibe_max,
            'type_colors': self.type_colors
        }
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

config = ConfigManager()
