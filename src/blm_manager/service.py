from .parser import BLMParser
from .models import BLMFile, BLMLine, StructuredBLM
from typing import List, Dict

class BLMService:
    @staticmethod
    def load(path: str) -> BLMFile:
        return BLMParser.load(path)

    @staticmethod
    def save(blm_file: BLMFile, path: str):
        BLMParser.save(blm_file, path)

    @staticmethod
    def load_structured(path: str) -> StructuredBLM:
        blm_file = BLMParser.load(path)
        return blm_file.to_structured()

    @staticmethod
    def get_stats(blm_file: BLMFile) -> Dict:
        """Retorna estatísticas úteis sobre o modelo"""
        stats = {
            "total_lines": len(blm_file.lines),
            "music_slots": 0,
            "sweeper_slots": 0,
            "commercial_blocks": 0,
            "fixed_files": 0,
            "markers": 0
        }
        
        for line in blm_file.lines:
            origin = line.get_int('o')
            res = line.resource.lower()
            
            if origin == 2: # .apm
                if 'vht' in res or 'vignette' in res:
                    stats["sweeper_slots"] += 1
                else:
                    stats["music_slots"] += 1
            elif origin == 5 or "reserva" in res:
                stats["commercial_blocks"] += 1
            elif ":" in line.resource and len(line.resource) <= 5:
                stats["markers"] += 1
            elif "." in line.resource: # .mp3, .wav, etc
                stats["fixed_files"] += 1
                
        return stats
