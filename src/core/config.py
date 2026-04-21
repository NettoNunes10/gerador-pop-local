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
            'SWEEPERS': 'U:/Materiais/Eventos Gerais/VHT - Geração',
            'PROMOS': 'U:/Materiais/Eventos Gerais/Chamadas Programas',
            'INTERCOM': 'U:/Materiais/Eventos Gerais/Intercom',
            'SAMPLES': 'U:/Materiais/Eventos Gerais/Amostra Musical',
            'TEMPLATES': 'U:/Materiais/Roteiros/Modelos',
            'OUTPUT': 'U:/Materiais/Roteiros',
            'FIXED_PREFIX': 'U:/Materiais/Eventos Gerais/Prefixo/PREFIXO POP FM.mp3'
        }
        self.favorite_artists = set()
        self.paid_rules = []
        self.surprise_rules = []
        self.day_templates = {
            "0": "SEGUNDA.blm",
            "1": "TERCA.blm",
            "2": "QUARTA.blm",
            "3": "QUINTA.blm",
            "4": "SEXTA.blm",
            "5": "SABADO.blm",
            "6": "DOMINGO.blm"
        }
        self.rotation_groups = DEFAULT_ROTATION_GROUPS[:]
        self.load()

    def load(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.paths.update(data.get('paths', {}))
                    self.favorite_artists = set(data.get('favorite_artists', []))
                    self.paid_rules = data.get('paid_rules', [])
                    self.surprise_rules = data.get('surprise_rules', [])
                    self.day_templates.update(data.get('day_templates', {}))
                    if 'rotation_groups' in data:
                        self.rotation_groups = data['rotation_groups']
            except:
                pass

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
            if 'surprise_rules' in new_config:
                self.surprise_rules = new_config['surprise_rules']
            if 'day_templates' in new_config:
                self.day_templates.update(new_config['day_templates'])
            if 'rotation_groups' in new_config:
                self.rotation_groups = new_config['rotation_groups']

        data = {
            'paths': self.paths,
            'favorite_artists': list(self.favorite_artists),
            'paid_rules': self.paid_rules,
            'surprise_rules': self.surprise_rules,
            'day_templates': self.day_templates,
            'rotation_groups': self.rotation_groups
        }
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

config = ConfigManager()
